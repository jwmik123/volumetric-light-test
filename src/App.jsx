import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three/webgpu';
import { useControls, button } from 'leva'
import { useEffect, useRef } from 'react'
import { VolumetricLight } from './VolumetricLight'

function CameraControls({ controlsRef }) {
  const { camera } = useThree()

  useControls('Camera Snapshot', {
    'Capture Position': button(() => {
      const pos = camera.position
      const target = controlsRef.current?.target

      const snapshot = {
        position: [
          parseFloat(pos.x.toFixed(2)),
          parseFloat(pos.y.toFixed(2)),
          parseFloat(pos.z.toFixed(2))
        ],
        target: target ? [
          parseFloat(target.x.toFixed(2)),
          parseFloat(target.y.toFixed(2)),
          parseFloat(target.z.toFixed(2))
        ] : [0, 0, 0],
        fov: camera.fov
      }
      console.log('Camera Snapshot:', snapshot)
      console.log(`position: [${snapshot.position.join(', ')}]`)
      console.log(`target: [${snapshot.target.join(', ')}]`)
      console.log(`fov: ${snapshot.fov}`)
    })
  })

  const { posX, posY, posZ, fov } = useControls('Camera Manual', {
    posX: { value: 1.5, min: -10, max: 10, step: 0.1 },
    posY: { value: 0.94, min: -10, max: 10, step: 0.1 },
    posZ: { value: 1.57, min: -10, max: 10, step: 0.1 },
    fov: { value: 50, min: 10, max: 120, step: 1 }
  })

  useEffect(() => {
    camera.position.set(posX, posY, posZ)
    camera.fov = fov
    camera.updateProjectionMatrix()
  }, [posX, posY, posZ, fov, camera])

  return null
}

function SunLight({ lightRef }) {
  const { lightX, lightY, lightZ, intensity } = useControls('Sun Light', {
    lightX: { value: -10, min: -20, max: 20, step: 0.5 },
    lightY: { value: 1.5, min: -20, max: 20, step: 0.5 },
    lightZ: { value: 5, min: -20, max: 20, step: 0.5 },
    intensity: { value: 5.5, min: 0, max: 10, step: 0.1 }
  })

  useEffect(() => {
    if (lightRef.current) {
      lightRef.current.position.set(lightX, lightY, lightZ)
      lightRef.current.castShadow = true
      lightRef.current.shadow.mapSize.width = 4096
      lightRef.current.shadow.mapSize.height = 4096
      lightRef.current.shadow.bias = -0.0001
      lightRef.current.shadow.normalBias = 0.02
      lightRef.current.shadow.radius = 2
      lightRef.current.shadow.camera.near = 0.5
      lightRef.current.shadow.camera.far = 50
      lightRef.current.shadow.camera.left = -10
      lightRef.current.shadow.camera.right = 10
      lightRef.current.shadow.camera.top = 10
      lightRef.current.shadow.camera.bottom = -10
    }
  }, [lightX, lightY, lightZ, lightRef])

  return (
    <directionalLight
      ref={lightRef}
      position={[lightX, lightY, lightZ]}
      intensity={intensity}
      castShadow
      color="#fff5e6"
    />
  )
}

function Model() {
  const { scene } = useGLTF('/Kamer.glb')

  useEffect(() => {
    // Traverse the model to access individual geometries and materials
    scene.traverse((child) => {
      console.log('Child:', child)
      console.log('  Type:', child.type)
      console.log('  Name:', child.name)

      if (child.isMesh) {
        console.log('  Geometry:', child.geometry)
        console.log('  Material:', child.material)

        // Enable shadows on all meshes
        child.castShadow = true
        child.receiveShadow = true

        // Remove windows to create open space for volumetric light
        if (child.name === 'Windows') {
          console.log('Found windows! Making them invisible for volumetric light')
          child.visible = false
        }
      }
    })
  }, [scene])

  return <primitive object={scene} scale={0.5} />
}

function App() {
  const controlsRef = useRef()
  const sunLightRef = useRef()

  return (
    <Canvas
      shadows
      frameloop="always"
      camera={{ position: [1.39, 0.98, 1.37], fov: 50 }}
      gl={async (props) => {
        const renderer = new THREE.WebGPURenderer(props);
        await renderer.init();
        renderer.setClearColor(new THREE.Color('#1a1a1a'), 1);
        return renderer;
      }}
      onCreated={({ gl, invalidate }) => {
        // Disable auto-clear since post-processing will handle it
        gl.autoClear = false
        // Trigger initial render
        invalidate()
      }}
    >
      <color attach="background" args={['#1a1a1a']} />
      <CameraControls controlsRef={controlsRef} />
      <ambientLight intensity={0.3} />
      <SunLight lightRef={sunLightRef} />
      <VolumetricLight sunLightRef={sunLightRef} coneAngle={25} />
      <Model />
      <OrbitControls ref={controlsRef} target={[0.13, 0.59, -0.31]} />
    </Canvas>
  )
}

export default App
