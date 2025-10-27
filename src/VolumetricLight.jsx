import { useEffect, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import {
  pass,
  Fn,
  vec4,
  vec3,
  vec2,
  uniform,
  If,
  dot,
  length,
  cos,
  sin,
  max,
  min,
  float,
  add,
  mul,
  sub,
  pow,
  exp,
  int,
  normalize,
  radians,
  Break,
  Continue,
  Loop,
  uv
} from 'three/tsl'

export function VolumetricLight({ sunLightRef, coneAngle = 45 }) {
  const { gl, scene, camera } = useThree()
  const postProcessingRef = useRef()
  const lightDirRef = useRef(new THREE.Vector3())

  useEffect(() => {
    if (!gl || !sunLightRef?.current) return

    console.log('Setting up post-processing...')

    // Set up post-processing for WebGPU
    const postProcessing = new THREE.PostProcessing(gl)

    // Create a scene pass (renders the scene)
    const scenePass = pass(scene, camera)
    const scenePassColor = scenePass.getTextureNode()
    const scenePassDepth = scenePass.getLinearDepthNode()

    // Polyfills for shader uniforms
    const projectionMatrixInverse = uniform(camera.projectionMatrixInverse)
    const lightDirection = uniform(lightDirRef.current)
    const lightPosition = uniform(sunLightRef.current.position)
    const viewMatrixInverse = uniform(camera.matrixWorld)
    const cameraPosition = uniform(camera.position)
    const cameraFar = uniform(camera.far)
    const coneAngleUniform = uniform(coneAngle)

    // Helper function to get world position from linear depth
    const getWorldPosition = Fn(([uvCoord, linearDepth]) => {
      // Convert UV to NDC space (-1 to 1)
      const ndcX = uvCoord.x.mul(2.0).sub(1.0)
      const ndcY = uvCoord.y.mul(2.0).sub(1.0)

      // Create a point at far plane in NDC
      const farPoint = vec4(ndcX, ndcY, 1.0, 1.0)

      // Transform to view space to get the ray direction
      const farView = projectionMatrixInverse.mul(farPoint)
      const viewRayDir = normalize(farView.xyz.div(farView.w))

      // Scale the view ray by the linear depth to get view position
      const viewPos = viewRayDir.mul(linearDepth)

      // Transform to world space
      const worldPos = viewMatrixInverse.mul(vec4(viewPos, 1.0))

      return worldPos.xyz
    })

    // Shadow calculation disabled - always returns 1.0 (no shadow)
    const calculateShadow = Fn(() => {
      return 1.0
    })

    const sdCone = Fn(([p, axisOrigin, axisDir, angleRad]) => {
      const p_to_origin = p.sub(axisOrigin)
      const h = dot(p_to_origin, axisDir)
      const r = length(p_to_origin.sub(axisDir.mul(h)))

      const c = cos(angleRad)
      const s = sin(angleRad)

      const distToSurfaceLine = r.mul(c).sub(h.mul(s))
      const distToApexPlane = h.negate()

      If(h.lessThan(0.0).and(distToSurfaceLine.greaterThan(0.0)), () => {
        return length(p_to_origin)
      })

      const boundaryDists = vec2(distToSurfaceLine, distToApexPlane)

      return length(max(boundaryDists, 0.0)).add(min(max(boundaryDists.x, boundaryDists.y), 0.0))
    })

    const SCATTERING_ANISO = float(0.5)

    const HGPhase = Fn(([mu]) => {
      const g = SCATTERING_ANISO
      const gg = g.mul(g)
      const denom = add(1.0, gg).sub(mul(2.0, g).mul(mu)).toVar()
      denom.assign(max(denom, 0.0001))
      const scatter = sub(1.0, gg).div(pow(denom, 1.5))

      return scatter
    })

    const BeersLaw = Fn(([dist, absorption]) => {
      return exp(dist.negate().mul(absorption))
    })

    const STEP_SIZE = float(0.5)
    const NUM_STEPS = int(50)
    const lightColor = vec3(0.2)
    const LIGHT_INTENSITY = float(3.5)
    const FOG_INTENSITY = float(0.1)

    const mainImage = Fn(() => {
      const uvCoord = uv()
      const inputColor = scenePassColor
      const depth = scenePassDepth
      const worldPosition = getWorldPosition(uvCoord, depth)
      const rayOrigin = cameraPosition
      const rayDir = normalize(worldPosition.sub(rayOrigin))
      const sceneDepth = length(worldPosition.sub(cameraPosition))
      const lightPos = lightPosition
      const lightDir = normalize(lightDirection)
      const coneAngleRad = radians(coneAngleUniform)
      const halfConeAngleRad = coneAngleRad.mul(0.5)

      const t = STEP_SIZE.toVar()
      const transmittance = float(5.0).toVar()
      const accumulatedLight = vec3(0.0).toVar()

      Loop({ start: 0, end: NUM_STEPS }, () => {
        const samplePos = rayOrigin.add(rayDir.mul(t))

        If(t.greaterThan(sceneDepth).or(t.greaterThan(cameraFar)), () => {
          Break()
        })

        const shadowFactor = calculateShadow()

        If(shadowFactor.equal(0.0), () => {
          t.addAssign(STEP_SIZE)
          Continue()
        })

        const sdfVal = sdCone(samplePos, lightPos, lightDir, halfConeAngleRad)
        const density = sdfVal.negate()

        If(density.lessThan(0.1), () => {
          t.addAssign(STEP_SIZE)
          Continue()
        })

        const distanceToLight = length(samplePos.sub(lightPos))
        const sampleLightDir = normalize(samplePos.sub(lightPos))
        const attenuation = exp(float(-0.3).mul(distanceToLight))
        const scatterPhase = HGPhase(dot(rayDir, sampleLightDir.negate()))
        const luminance = lightColor.mul(LIGHT_INTENSITY).mul(attenuation).mul(scatterPhase)
        const stepDensity = FOG_INTENSITY.mul(density).toVar()
        stepDensity.assign(max(stepDensity, 0.0))
        const stepTransmittance = BeersLaw(stepDensity.mul(STEP_SIZE), 1.0)
        accumulatedLight.addAssign(luminance.mul(transmittance).mul(stepDensity).mul(STEP_SIZE))
        transmittance.mulAssign(stepTransmittance)
        t.addAssign(STEP_SIZE)
      })

      const volumetricLight = accumulatedLight
      const finalColor = inputColor.rgb.add(volumetricLight)

      return vec4(finalColor, 1.0)
    })

    // Apply volumetric effect
    const volumetricPass = mainImage()

    // Output the volumetric lighting effect
    postProcessing.outputNode = volumetricPass

    console.log('Volumetric lighting shader applied')
    console.log('Light position:', sunLightRef.current.position)
    console.log('Cone angle:', coneAngle)

    // Store it on the ref
    postProcessingRef.current = postProcessing

    console.log('Post-processing setup complete')

    return () => {
      // Cleanup
      postProcessingRef.current = null
    }
  }, [gl, scene, camera, sunLightRef, coneAngle])

  // Render with post-processing each frame
  useFrame(({ gl: renderer }) => {
    // Update light direction each frame
    if (sunLightRef?.current) {
      // Calculate light direction pointing from light toward origin (into the room)
      lightDirRef.current.set(0, 0, 0)
      lightDirRef.current.subVectors(new THREE.Vector3(0, 0, 0), sunLightRef.current.position)
      lightDirRef.current.normalize()

      // Store for debugging
      sunLightRef.current.userData.direction = lightDirRef.current
    }

    // Render with post-processing
    if (postProcessingRef.current) {
      postProcessingRef.current.render()
    }
  }, 1) // Priority 1 to render after the scene

  return null
}
