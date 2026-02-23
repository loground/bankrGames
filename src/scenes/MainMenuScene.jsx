import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { Environment, Trail } from '@react-three/drei';
import { Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

function ArcadeModel() {
  const { gl } = useThree();
  const groupRef = useRef(null);
  const gltf = useLoader(GLTFLoader, '/3d/bankrArcade.glb', (loader) => {
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('/draco/');
    loader.setDRACOLoader(dracoLoader);

    const ktx2Loader = new KTX2Loader();
    ktx2Loader.setTranscoderPath('/basis/');
    ktx2Loader.detectSupport(gl);
    loader.setKTX2Loader(ktx2Loader);
  });

  const { model, modelScale } = useMemo(() => {
    const cloned = clone(gltf.scene);
    const box = new Box3().setFromObject(cloned);
    const center = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z) || 1;

    cloned.position.sub(center);

    return {
      model: cloned,
      modelScale: 3 / maxDimension,
    };
  }, [gltf.scene]);

  useEffect(() => {
    model.traverse((node) => {
      if (!node.isMesh || !node.material) {
        return;
      }

      const materials = Array.isArray(node.material) ? node.material : [node.material];
      const adjusted = materials.map((material) => {
        const next = material.clone();

        if ('metalness' in next) {
          next.metalness = Math.min(next.metalness, 0.35);
        }
        if ('envMapIntensity' in next) {
          next.envMapIntensity = 1.2;
        }
        if ('emissiveIntensity' in next) {
          next.emissiveIntensity = Math.max(next.emissiveIntensity || 0, 0.18);
        }

        return next;
      });

      node.material = Array.isArray(node.material) ? adjusted : adjusted[0];
    });
  }, [model]);

  useFrame((state, delta) => {
    if (!groupRef.current) {
      return;
    }
    groupRef.current.rotation.y += delta * 0.22;
    groupRef.current.position.y = -0.2 + Math.sin(state.clock.elapsedTime * 0.7) * 0.04;
  });

  return (
    <>
      <group ref={groupRef} position={[0, -0.2, 0]} rotation={[0, -2, 0]} scale={[modelScale, modelScale, modelScale]}>
        <primitive object={model} />
      </group>
      <ArcadeTrails />
    </>
  );
}

function TrailOrb({ radius, speed, phase, color, width, length }) {
  const ref = useRef(null);

  useFrame((state) => {
    if (!ref.current) {
      return;
    }
    const t = state.clock.elapsedTime * speed + phase;
    ref.current.position.set(Math.cos(t) * radius, -0.15 + Math.sin(t * 1.6) * 0.3, Math.sin(t) * radius * 0.65);
  });

  return (
    <Trail width={width} length={length} color={color} attenuation={(t) => t * t}>
      <mesh ref={ref}>
        <sphereGeometry args={[0.05, 10, 10]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </Trail>
  );
}

function ArcadeTrails() {
  return (
    <group>
      <TrailOrb radius={2.2} speed={0.9} phase={0.2} color="#7dd3fc" width={0.45} length={2.2} />
      <TrailOrb radius={2.5} speed={0.72} phase={2.6} color="#c4b5fd" width={0.36} length={2.4} />
      <TrailOrb radius={2.0} speed={1.05} phase={4.1} color="#f9a8d4" width={0.34} length={2.0} />
    </group>
  );
}

function MainMenuCameraRig({ isMobile }) {
  const { camera, gl } = useThree();
  const controlsRef = useRef(null);

  useEffect(() => {
    camera.position.set(0, 0.05, isMobile ? 7.2 : 6.4);
    camera.lookAt(0, 0, 0);

    const controls = new OrbitControls(camera, gl.domElement);
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minAzimuthAngle = -0.9;
    controls.maxAzimuthAngle = 0.9;
    controls.minPolarAngle = 1.1;
    controls.maxPolarAngle = 2.0;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    return () => {
      controls.dispose();
      controlsRef.current = null;
    };
  }, [camera, gl.domElement, isMobile]);

  useFrame(() => {
    if (controlsRef.current) {
      controlsRef.current.update();
    }
  });

  return null;
}

export default function MainMenuScene({ isMobile }) {
  return (
    <group>
      <MainMenuCameraRig isMobile={isMobile} />
      <Environment preset="sunset" />
      <ArcadeModel />
    </group>
  );
}
