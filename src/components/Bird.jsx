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
  animationMap = null,
  clipOverride = null,
  positionOffset = null,
  rotationOffsetY = 0,
  targetOpacity = 1,
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
  const materialsRef = useRef([]);
  const opacityRef = useRef(targetOpacity);

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

  useEffect(() => {
    const nextMaterials = [];
    model.traverse((node) => {
      if (!node.isMesh || !node.material) {
        return;
      }

      const source = Array.isArray(node.material) ? node.material : [node.material];
      const clonedMaterials = source.map((material) => {
        const nextMaterial = material.clone();
        nextMaterial.transparent = true;
        nextMaterial.opacity = opacityRef.current;
        nextMaterials.push(nextMaterial);
        return nextMaterial;
      });

      node.material = Array.isArray(node.material) ? clonedMaterials : clonedMaterials[0];
    });

    materialsRef.current = nextMaterials;

    return () => {
      materialsRef.current.forEach((material) => material.dispose());
      materialsRef.current = [];
    };
  }, [model]);

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

    const readyClip = animationMap?.ready ?? 0;
    const playingClip = animationMap?.playing ?? 2;
    const gameoverClip = animationMap?.gameover ?? 1;

    if (phase === 'ready') {
      playClip(readyClip, LoopRepeat, Infinity, false);
      return;
    }

    if (phase === 'starting' || phase === 'playing') {
      playClip(playingClip, LoopRepeat, Infinity, false);
      return;
    }

    if (phase === 'gameover') {
      playClip(gameoverClip, LoopOnce, 1, true);
    }
  }, [animationMap, clipOverride, gltf.animations.length, phase, playClip]);

  useFrame((_, delta) => {
    if (mixerRef.current) {
      mixerRef.current.update(delta);
    }

    const nextOpacity = opacityRef.current + (targetOpacity - opacityRef.current) * Math.min(1, delta * 12);
    if (Math.abs(nextOpacity - opacityRef.current) > 0.001) {
      opacityRef.current = nextOpacity;
      for (let i = 0; i < materialsRef.current.length; i += 1) {
        materialsRef.current[i].opacity = nextOpacity;
      }
    } else if (opacityRef.current !== targetOpacity) {
      opacityRef.current = targetOpacity;
      for (let i = 0; i < materialsRef.current.length; i += 1) {
        materialsRef.current[i].opacity = targetOpacity;
      }
    }
  });

  const baseRotation = phase === 'ready' ? [0, -Math.PI / 2, 0] : [0, 0, 0];
  const modelRotation = [
    rotationX !== null ? rotationX : baseRotation[0],
    (rotationY !== null ? rotationY : baseRotation[1]) + rotationOffsetY,
    baseRotation[2],
  ];
  const modelPosition = [
    x + (positionOffset?.[0] ?? 0),
    y + (positionOffset?.[1] ?? 0),
    z + (positionOffset?.[2] ?? 0),
  ];

  return (
    <group position={modelPosition} rotation={modelRotation} scale={[modelScale, modelScale, modelScale]}>
      <primitive object={model} />
    </group>
  );
}
