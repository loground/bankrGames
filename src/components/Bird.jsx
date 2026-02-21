import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { AnimationMixer, Box3, LoopOnce, LoopRepeat, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

export default function Bird({
  x,
  y,
  z,
  phase,
  modelPath = '/3d/bankr3_opt.glb',
  clipOverride = null,
  rotationY = null,
  rotationX = null,
}) {
  const { gl } = useThree();
  const gltf = useLoader(GLTFLoader, modelPath, (loader) => {
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('/draco/');
    loader.setDRACOLoader(dracoLoader);

    const ktx2Loader = new KTX2Loader();
    ktx2Loader.setTranscoderPath('/basis/');
    ktx2Loader.detectSupport(gl);
    loader.setKTX2Loader(ktx2Loader);
  });

  const mixerRef = useRef(null);
  const actionRef = useRef(null);

  const { model, modelScale } = useMemo(() => {
    const cloned = clone(gltf.scene);
    const box = new Box3().setFromObject(cloned);
    const center = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z) || 1;

    cloned.position.sub(center);

    return {
      model: cloned,
      modelScale: 1.7 / maxDimension,
    };
  }, [gltf.scene]);

  const playClip = useCallback(
    (index, loopMode, repetitions, clampWhenFinished) => {
      if (!gltf.animations.length || !mixerRef.current) {
        return;
      }

      const safeIndex = Math.min(index, gltf.animations.length - 1);
      const clip = gltf.animations[safeIndex];
      const action = mixerRef.current.clipAction(clip);

      if (actionRef.current && actionRef.current !== action) {
        actionRef.current.stop();
      }

      action.enabled = true;
      action.reset();
      action.setLoop(loopMode, repetitions);
      action.clampWhenFinished = clampWhenFinished;
      action.play();
      actionRef.current = action;
    },
    [gltf.animations]
  );

  useEffect(() => {
    const mixer = new AnimationMixer(model);
    mixerRef.current = mixer;
    playClip(0, LoopRepeat, Infinity, false);

    return () => {
      mixer.stopAllAction();
      mixerRef.current = null;
      actionRef.current = null;
    };
  }, [model, playClip]);

  useEffect(() => {
    if (!mixerRef.current || !gltf.animations.length) {
      return;
    }

    if (clipOverride !== null) {
      playClip(clipOverride, LoopRepeat, Infinity, false);
      return;
    }

    if (phase === 'ready') {
      playClip(0, LoopRepeat, Infinity, false);
      return;
    }

    if (phase === 'starting' || phase === 'playing') {
      playClip(2, LoopRepeat, Infinity, false);
      return;
    }

    if (phase === 'gameover') {
      playClip(1, LoopOnce, 1, true);
    }
  }, [clipOverride, gltf.animations.length, phase, playClip]);

  useFrame((_, delta) => {
    if (mixerRef.current) {
      mixerRef.current.update(delta);
    }
  });

  const baseRotation = phase === 'ready' ? [0, -Math.PI / 2, 0] : [0, 0, 0];
  const modelRotation = [
    rotationX !== null ? rotationX : baseRotation[0],
    rotationY !== null ? rotationY : baseRotation[1],
    baseRotation[2],
  ];

  return (
    <group position={[x, y, z]} rotation={modelRotation} scale={[modelScale, modelScale, modelScale]}>
      <primitive object={model} />
    </group>
  );
}
