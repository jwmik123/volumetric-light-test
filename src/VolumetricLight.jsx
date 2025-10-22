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
  smoothstep,
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

    // Create uniforms for volumetric lighting
    const lightPosUniform = uniform(sunLightRef.current.position)
    const lightDirUniform = uniform(lightDirRef.current)
    const cameraPosUniform = uniform(camera.position)
    const cameraFarUniform = uniform(camera.far)
    const coneAngleUniform = uniform(coneAngle)

    // Helper functions for volumetric lighting
    const sdCone = Fn(([p, axisOrigin, axisDir, angleRad]) => {
      const p_to_origin = p.sub(axisOrigin)
      const h = dot(p_to_origin, axisDir)
      const r = length(p_to_origin.sub(axisDir.mul(h)))
      const c = cos(angleRad)
      const s = sin(angleRad)

      const distToSurfaceLine = r.mul(c).sub(h.mul(s))
      const distToApexPlane = h.negate()

      const boundaryDists = vec2(distToSurfaceLine, distToApexPlane)
      return length(max(boundaryDists, 0.0)).add(min(max(boundaryDists.x, boundaryDists.y), 0.0))
    })

    const HGPhase = Fn(([mu]) => {
      const g = float(0.5) // SCATTERING_ANISO
      const gg = g.mul(g)
      const denom = add(1.0, gg).sub(mul(2.0, g).mul(mu))
      const scatter = sub(1.0, gg).div(pow(max(denom, 0.0001), 1.5))
      return scatter
    })

    const BeersLaw = Fn(([dist, absorption]) => {
      return exp(dist.negate().mul(absorption))
    })

    // Volumetric lighting effect
    const volumetricEffect = Fn(() => {
      const uvCoord = uv()
      const inputColor = scenePassColor
      const depth = scenePassDepth

      // Reconstruct world position (simplified)
      const rayOrigin = cameraPosUniform
      const rayDir = normalize(vec3(
        uvCoord.x.sub(0.5).mul(2.0),
        uvCoord.y.sub(0.5).mul(2.0),
        -1.0
      ))

      const lightPos = lightPosUniform
      const lightDir = normalize(lightDirUniform)
      const coneAngleRad = radians(coneAngleUniform)
      const halfConeAngleRad = coneAngleRad.mul(0.5)

      const STEP_SIZE = float(0.1)
      const NUM_STEPS = int(50)
      const lightColor = vec3(1.0, 0.95, 0.8)
      const LIGHT_INTENSITY = float(0.5)
      const FOG_DENSITY = float(0.1)

      const t = float(STEP_SIZE).toVar()
      const transmittance = float(1.0).toVar()
      const accumulatedLight = vec3(0.0).toVar()

      Loop({start: 0, end: NUM_STEPS}, ({i}) => {
        const samplePos = rayOrigin.add(rayDir.mul(t))

        If(t.greaterThan(depth.mul(cameraFarUniform)), () => {
          Break()
        })

        const sdfVal = sdCone(samplePos, lightPos, lightDir, halfConeAngleRad)
        const shapeFactor = smoothstep(0.5, 0.0, sdfVal)

        If(shapeFactor.lessThan(0.01), () => {
          t.addAssign(STEP_SIZE)
          Continue()
        })

        const distanceToLight = length(samplePos.sub(lightPos))
        const sampleLightDir = normalize(samplePos.sub(lightPos))
        const attenuation = exp(float(-0.1).mul(distanceToLight))
        const scatterPhase = HGPhase(dot(rayDir, sampleLightDir.negate()))
        const luminance = lightColor.mul(LIGHT_INTENSITY).mul(attenuation).mul(scatterPhase)
        const stepDensity = FOG_DENSITY.mul(shapeFactor)
        const stepTransmittance = BeersLaw(stepDensity.mul(STEP_SIZE), 1.0)

        transmittance.mulAssign(stepTransmittance)
        accumulatedLight.addAssign(luminance.mul(transmittance).mul(stepDensity).mul(STEP_SIZE))

        t.addAssign(STEP_SIZE)
      })

      const volumetricLight = accumulatedLight
      const finalColor = inputColor.rgb.add(volumetricLight)

      return vec4(finalColor, 1.0)
    })

    // Apply volumetric effect by calling the function
    const volumetricPass = volumetricEffect()

    // Output the volumetric lighting effect
    postProcessing.outputNode = volumetricPass

    console.log('Volumetric lighting shader applied')
    console.log('Light position:', sunLightRef.current.position)
    console.log('Cone angle:', coneAngle)

    // Store it on the ref
    postProcessingRef.current = postProcessing

    console.log('Post-processing setup complete')
    console.log('Sun light position:', sunLightRef.current.position)
    console.log('Cone angle:', coneAngle)

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
