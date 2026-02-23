import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

function ArcadeModel() {
  const { gl } = useThree();
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
      modelScale: 4.4 / maxDimension,
    };
  }, [gltf.scene]);

  return (
    <group position={[0, -0.5, 0]} rotation={[0, -2, 0]} scale={[modelScale, modelScale, modelScale]}>
      <primitive object={model} />
    </group>
  );
}

function MainMenuCameraRig({ isMobile }) {
  const { camera, gl } = useThree();
  const controlsRef = useRef(null);

  useEffect(() => {
    camera.position.set(0, 0.05, isMobile ? 7.2 : 6.4);
    camera.lookAt(0, -0.2, 0);

    const controls = new OrbitControls(camera, gl.domElement);
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minAzimuthAngle = -0.9;
    controls.maxAzimuthAngle = 0.9;
    controls.minPolarAngle = 1.1;
    controls.maxPolarAngle = 2.0;
    controls.target.set(0, -0.2, 0);
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
      <ambientLight intensity={1.2} />
      <directionalLight position={[4, 5, 3]} intensity={1.2} />
      <directionalLight position={[-4, 2, -1]} intensity={0.8} />
      <ArcadeModel />
    </group>
  );
}
