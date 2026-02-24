import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Trail } from '@react-three/drei';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import helvetikerFont from 'three/examples/fonts/helvetiker_bold.typeface.json';
import Bird from '../components/Bird';
import {
  BIRD_RADIUS,
  BIRD_X,
  FLAP_VELOCITY,
  FLOOR_Y,
  GRAVITY,
  INTRO_BIRD_X,
  INTRO_BIRD_Y,
  INTRO_BIRD_Z,
  PIPE_GAP,
  PIPE_DESPAWN_X,
  PIPE_SPAWN_SECONDS,
  PIPE_START_X,
  PIPE_WIDTH,
  STARTING_DURATION,
  WORLD_TOP,
  getPipeSpeedForScore,
  makePipe,
} from '../constants/gameConstants';

const SPECIAL_EFFECT_TYPES = ['pov', 'reverse', 'normal'];
const SPECIAL_SPAWN_MIN_PIPES = 12;
const SPECIAL_SPAWN_MAX_PIPES = 16;
const MODE_SWITCH_SAFE_SECONDS = 0.7;

function PipePair({ x, gapY }) {
  const gapTop = gapY + PIPE_GAP / 2;
  const gapBottom = gapY - PIPE_GAP / 2;

  const topHeight = WORLD_TOP - gapTop;
  const topY = gapTop + topHeight / 2;

  const bottomHeight = gapBottom - FLOOR_Y;
  const bottomY = FLOOR_Y + bottomHeight / 2;
  const candleBodyWidth = PIPE_WIDTH;
  const candleWickWidth = Math.max(0.04, PIPE_WIDTH * 0.07);
  const wickOverhang = 0.45;
  const candleDepth = 0.6;
  const wickDepth = 0.16;
  const topWickHeight = topHeight + wickOverhang * 2;
  const bottomWickHeight = bottomHeight + wickOverhang * 2;

  return (
    <>
      <mesh position={[x, topY, 0]}>
        <boxGeometry args={[candleBodyWidth, topHeight, candleDepth]} />
        <meshStandardMaterial color="#dc2626" />
      </mesh>
      <mesh position={[x, topY, 0]}>
        <boxGeometry args={[candleWickWidth, topWickHeight, wickDepth]} />
        <meshStandardMaterial color="#fca5a5" />
      </mesh>
      <mesh position={[x, bottomY, 0]}>
        <boxGeometry args={[candleBodyWidth, bottomHeight, candleDepth]} />
        <meshStandardMaterial color="#15803d" />
      </mesh>
      <mesh position={[x, bottomY, 0]}>
        <boxGeometry args={[candleWickWidth, bottomWickHeight, wickDepth]} />
        <meshStandardMaterial color="#86efac" />
      </mesh>
    </>
  );
}

function World() {
  return (
    <>
      <mesh position={[0, FLOOR_Y - 0.15, 0]}>
        <boxGeometry args={[24, 0.3, 1]} />
        <meshStandardMaterial color="#4b5563" />
      </mesh>
      <mesh position={[0, -4.6, -0.2]}>
        <boxGeometry args={[24, 2, 0.5]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
    </>
  );
}

function EffectMarker({ x, y, effect }) {
  if (effect === 'pov') {
    return (
      <mesh position={[x, y, 0]}>
        <boxGeometry args={[0.48, 0.48, 0.48]} />
        <meshStandardMaterial color="#fde047" emissive="#f59e0b" emissiveIntensity={0.35} />
      </mesh>
    );
  }

  if (effect === 'reverse') {
    return (
      <mesh position={[x, y, 0]} rotation={[0, 0, Math.PI / 2]}>
        <coneGeometry args={[0.34, 0.62, 3]} />
        <meshStandardMaterial color="#f97316" emissive="#ea580c" emissiveIntensity={0.35} />
      </mesh>
    );
  }

  return (
    <mesh position={[x, y, 0]} rotation={[0, 0, Math.PI / 4]}>
      <boxGeometry args={[0.44, 0.44, 0.44]} />
      <meshStandardMaterial color="#22c55e" emissive="#16a34a" emissiveIntensity={0.32} />
    </mesh>
  );
}

function PovBillions({ flightMode }) {
  const geometry = useMemo(() => {
    const font = new FontLoader().parse(helvetikerFont);
    const textGeometry = new TextGeometry('BILLIONS', {
      font,
      size: 0.7,
      depth: 0.22,
      curveSegments: 8,
      bevelEnabled: false,
    });
    textGeometry.computeBoundingBox();
    if (textGeometry.boundingBox) {
      const width = textGeometry.boundingBox.max.x - textGeometry.boundingBox.min.x;
      textGeometry.translate(-width / 2, 0, 0);
    }
    return textGeometry;
  }, []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  const direction = flightMode === 'reverse' ? -1 : 1;
  const birdX = flightMode === 'reverse' ? -BIRD_X : BIRD_X;

  return (
    <mesh
      position={[birdX + direction * 9.4, 1.2, 0]}
      rotation={[0, direction === 1 ? -Math.PI / 2 : Math.PI / 2, 0]}
      geometry={geometry}
    >
      <meshStandardMaterial color="#f97316" metalness={0.35} roughness={0.4} emissive="#ea580c" emissiveIntensity={0.25} />
    </mesh>
  );
}

function SpeedTrails({ birdXRef, birdYRef, birdZRef, velocityRef, phaseRef, flightModeRef }) {
  const headARef = useRef(null);
  const headBRef = useRef(null);
  const headCRef = useRef(null);
  const headDRef = useRef(null);
  const anchorYRef = useRef(null);
  const anchorZRef = useRef(null);

  useFrame((state) => {
    const direction = flightModeRef.current === 'reverse' ? -1 : 1;
    const moving = phaseRef.current === 'playing' || phaseRef.current === 'starting';
    const speed = Math.abs(velocityRef.current);
    const power = moving ? Math.min(1.35, speed / 4.6 + (phaseRef.current === 'starting' ? 0.18 : 0)) : 0;

    const baseX = birdXRef.current - direction * (0.22 + power * 0.2);
    if (anchorYRef.current === null) {
      anchorYRef.current = birdYRef.current - 0.28;
    }
    if (anchorZRef.current === null) {
      anchorZRef.current = birdZRef.current;
    }
    const yFollow = velocityRef.current < -0.35 ? 0.2 : 0.14;
    anchorYRef.current += (birdYRef.current - 0.28 - anchorYRef.current) * yFollow;
    anchorZRef.current += (birdZRef.current - anchorZRef.current) * 0.18;
    const baseY = anchorYRef.current;
    const baseZ = anchorZRef.current;
    const t = state.clock.elapsedTime;
    const active = power > 0.06;

    const heads = [headARef.current, headBRef.current, headCRef.current, headDRef.current];
    // Keep trails attached around the leg area with tight vertical spread.
    const yOffsets = [0.02, -0.02, 0.02, -0.02];
    const zOffsets = [0.11, 0.11, -0.11, -0.11];

    for (let i = 0; i < heads.length; i += 1) {
      const head = heads[i];
      if (!head) {
        continue;
      }

      const jitterY = Math.sin(t * (7 + i * 0.6) + i) * (0.0008 + power * 0.0015);
      const jitterZ = Math.cos(t * (6 + i * 0.5) + i * 0.4) * (0.0012 + power * 0.002);
      const drag = i * (0.1 + power * 0.14);
      const xPulse = Math.sin(t * (16 + i * 1.4) + i * 0.3) * (0.02 + power * 0.08);

      head.position.set(
        baseX - direction * (drag + xPulse),
        baseY + yOffsets[i] + jitterY,
        baseZ + zOffsets[i] + jitterZ
      );
      head.scale.setScalar(0.4 + power * 0.58);
      head.visible = active;
    }
  });

  return (
    <>
      <Trail width={0.9} length={3.1} color="#f97316" attenuation={(value) => value * value}>
        <group ref={headARef} />
      </Trail>
      <Trail width={0.9} length={3.1} color="#f97316" attenuation={(value) => value * value}>
        <group ref={headBRef} />
      </Trail>
      <Trail width={0.84} length={2.8} color="#f97316" attenuation={(value) => value * value}>
        <group ref={headCRef} />
      </Trail>
      <Trail width={0.84} length={2.8} color="#f97316" attenuation={(value) => value * value}>
        <group ref={headDRef} />
      </Trail>
    </>
  );
}

export function FlappyCameraRig({ phase, isMobile, cameraMode = 'default', flightMode = 'normal' }) {
  const { camera } = useThree();
  const chasePosRef = useRef(null);

  useEffect(() => {
    const baseZ = isMobile ? 10 : 8;
    const playingZ = isMobile ? baseZ * 1.05 : baseZ;
    const direction = flightMode === 'reverse' ? -1 : 1;
    const birdX = flightMode === 'reverse' ? -BIRD_X : BIRD_X;

    if (cameraMode === 'pov' && phase === 'playing') {
      const backOffset = isMobile ? 1.15 : 2.4;
      const lookAhead = isMobile ? 3.0 : 6.0;
      const targetX = birdX - direction * backOffset;
      const targetY = isMobile ? 0.78 : 0.95;
      const targetZ = isMobile ? 2.9 : 2.25;
      if (!chasePosRef.current) {
        chasePosRef.current = { x: targetX, y: targetY, z: targetZ };
      }
      const smoothX = isMobile ? 0.28 : 0.22;
      const smoothY = isMobile ? 0.2 : 0.16;
      const smoothZ = isMobile ? 0.22 : 0.18;
      chasePosRef.current.x += (targetX - chasePosRef.current.x) * smoothX;
      chasePosRef.current.y += (targetY - chasePosRef.current.y) * smoothY;
      chasePosRef.current.z += (targetZ - chasePosRef.current.z) * smoothZ;

      camera.position.set(chasePosRef.current.x, chasePosRef.current.y, chasePosRef.current.z);
      camera.fov = isMobile ? 86 : 72;
      camera.updateProjectionMatrix();
      camera.lookAt(birdX + direction * lookAhead, isMobile ? 0.2 : 0.24, 0);
      return;
    }

    chasePosRef.current = null;
    camera.fov = 44;
    camera.updateProjectionMatrix();
    camera.position.set(0, 0, phase === 'playing' ? playingZ : baseZ);
    camera.lookAt(0, 0, 0);
  }, [camera, cameraMode, flightMode, isMobile, phase]);

  return null;
}

export default function FlappyGameScene({
  phase,
  setPhase,
  score,
  setScore,
  flightMode = 'normal',
  setFlightMode,
  cameraMode = 'default',
  setCameraMode,
}) {
  const [birdY, setBirdY] = useState(INTRO_BIRD_Y);
  const [birdX, setBirdX] = useState(INTRO_BIRD_X);
  const [birdZ, setBirdZ] = useState(INTRO_BIRD_Z);
  const [pipes, setPipes] = useState([]);
  const [effects, setEffects] = useState([]);

  const birdYRef = useRef(INTRO_BIRD_Y);
  const birdXRef = useRef(INTRO_BIRD_X);
  const birdZRef = useRef(INTRO_BIRD_Z);
  const velocityRef = useRef(0);
  const pipesRef = useRef([]);
  const phaseRef = useRef(phase);
  const flightModeRef = useRef(flightMode);
  const cameraModeRef = useRef(cameraMode);
  const spawnTimerRef = useRef(0);
  const scoreRef = useRef(score);
  const pipeIdRef = useRef(0);
  const startProgressRef = useRef(0);
  const effectsRef = useRef([]);
  const effectIdRef = useRef(0);
  const specialSpawnCountdownRef = useRef(SPECIAL_SPAWN_MIN_PIPES);
  const lastEffectTypeRef = useRef(null);
  const modeSwitchSafeRef = useRef(0);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    flightModeRef.current = flightMode;
  }, [flightMode]);

  useEffect(() => {
    cameraModeRef.current = cameraMode;
  }, [cameraMode]);

  const randomSpecialCountdown = useCallback(
    () => SPECIAL_SPAWN_MIN_PIPES + Math.floor(Math.random() * (SPECIAL_SPAWN_MAX_PIPES - SPECIAL_SPAWN_MIN_PIPES + 1)),
    []
  );

  const pickRandomEffectType = useCallback(() => {
    const allowed = SPECIAL_EFFECT_TYPES.filter((type) => type !== lastEffectTypeRef.current);
    const nextType = allowed[Math.floor(Math.random() * allowed.length)];
    lastEffectTypeRef.current = nextType;
    return nextType;
  }, []);

  const applyEffect = useCallback(
    (effectType) => {
      if (effectType === 'pov') {
        const nextMode = cameraModeRef.current === 'pov' ? 'default' : 'pov';
        cameraModeRef.current = nextMode;
        setCameraMode(nextMode);
        return;
      }

      if (effectType === 'reverse') {
        const nextMode = flightModeRef.current === 'reverse' ? 'normal' : 'reverse';
        flightModeRef.current = nextMode;
        modeSwitchSafeRef.current = MODE_SWITCH_SAFE_SECONDS;
        setFlightMode(nextMode);
        return;
      }

      if (flightModeRef.current !== 'normal') {
        flightModeRef.current = 'normal';
        modeSwitchSafeRef.current = MODE_SWITCH_SAFE_SECONDS;
        setFlightMode('normal');
      }
      if (cameraModeRef.current !== 'default') {
        cameraModeRef.current = 'default';
        setCameraMode('default');
      }
    },
    [setCameraMode, setFlightMode]
  );

  const resetRound = useCallback(() => {
    birdYRef.current = INTRO_BIRD_Y;
    birdXRef.current = INTRO_BIRD_X;
    birdZRef.current = INTRO_BIRD_Z;
    velocityRef.current = 0;
    pipesRef.current = [];
    effectsRef.current = [];
    spawnTimerRef.current = 0;
    scoreRef.current = 0;
    startProgressRef.current = 0;
    pipeIdRef.current = 0;
    effectIdRef.current = 0;
    lastEffectTypeRef.current = null;
    specialSpawnCountdownRef.current = randomSpecialCountdown();
    flightModeRef.current = 'normal';
    cameraModeRef.current = 'default';
    modeSwitchSafeRef.current = 0;

    setBirdY(INTRO_BIRD_Y);
    setBirdX(INTRO_BIRD_X);
    setBirdZ(INTRO_BIRD_Z);
    setPipes([]);
    setEffects([]);
    setScore(0);
    setFlightMode('normal');
    setCameraMode('default');
    setPhase('ready');
  }, [randomSpecialCountdown, setCameraMode, setFlightMode, setPhase, setScore]);

  const crash = useCallback(() => {
    if (phaseRef.current !== 'gameover') {
      setPhase('gameover');
    }
  }, [setPhase]);

  const flap = useCallback(() => {
    velocityRef.current = FLAP_VELOCITY;
  }, []);

  const onAction = useCallback(() => {
    if (phaseRef.current === 'ready') {
      startProgressRef.current = 0;
      setPhase('starting');
      return;
    }

    if (phaseRef.current === 'starting') {
      return;
    }

    if (phaseRef.current === 'playing') {
      flap();
      return;
    }

    resetRound();
  }, [flap, resetRound, setPhase]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.code === 'Space' && !event.repeat) {
        event.preventDefault();
        onAction();
      }
    };

    const onPointerDown = () => {
      onAction();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [onAction]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const isReverse = flightModeRef.current === 'reverse';
    const direction = isReverse ? -1 : 1;
    const targetBirdX = isReverse ? -BIRD_X : BIRD_X;
    const pipeSpawnX = isReverse ? -PIPE_START_X : PIPE_START_X;
    const pipeDespawnX = isReverse ? -PIPE_DESPAWN_X : PIPE_DESPAWN_X;
    if (modeSwitchSafeRef.current > 0) {
      modeSwitchSafeRef.current = Math.max(0, modeSwitchSafeRef.current - dt);
    }

    if (phaseRef.current === 'starting') {
      startProgressRef.current = Math.min(startProgressRef.current + dt / STARTING_DURATION, 1);

      const t = startProgressRef.current;
      const nextX = INTRO_BIRD_X + (targetBirdX - INTRO_BIRD_X) * t;
      const nextY = INTRO_BIRD_Y + (0 - INTRO_BIRD_Y) * t;
      const nextZ = INTRO_BIRD_Z + (0 - INTRO_BIRD_Z) * t;

      birdXRef.current = nextX;
      birdYRef.current = nextY;
      birdZRef.current = nextZ;

      setBirdX(nextX);
      setBirdY(nextY);
      setBirdZ(nextZ);

      if (t >= 1) {
        velocityRef.current = 0;
        birdXRef.current = targetBirdX;
        birdZRef.current = 0;
        setBirdX(targetBirdX);
        setBirdZ(0);
        setPhase('playing');
      }

      return;
    }

    if (phaseRef.current !== 'playing') {
      return;
    }

    const vy = velocityRef.current + GRAVITY * dt;
    const y = birdYRef.current + vy * dt;

    velocityRef.current = vy;
    birdYRef.current = y;
    birdXRef.current += (targetBirdX - birdXRef.current) * Math.min(1, dt * 8);
    birdZRef.current = 0;
    const currentBirdX = birdXRef.current;

    if (y - BIRD_RADIUS <= FLOOR_Y || y + BIRD_RADIUS >= WORLD_TOP) {
      setBirdY(y);
      crash();
      return;
    }

    spawnTimerRef.current += dt;

    if (spawnTimerRef.current >= PIPE_SPAWN_SECONDS) {
      spawnTimerRef.current = 0;
      const newPipe = makePipe(pipeIdRef.current++, pipeSpawnX);
      pipesRef.current = [...pipesRef.current, newPipe];

      specialSpawnCountdownRef.current -= 1;
      if (specialSpawnCountdownRef.current <= 0) {
        const nextEffect = pickRandomEffectType();
        const effectY = Math.max(FLOOR_Y + 0.9, Math.min(WORLD_TOP - 0.9, newPipe.gapY + (Math.random() - 0.5) * 1.2));
        const effectX = newPipe.x + (Math.random() - 0.5) * 1.1;
        effectsRef.current = [
          ...effectsRef.current,
          {
            id: `effect-${effectIdRef.current++}`,
            x: effectX,
            y: effectY,
            effect: nextEffect,
          },
        ];
        specialSpawnCountdownRef.current = randomSpecialCountdown();
      }
    }

    let nextScore = scoreRef.current;
    const pipeSpeed = getPipeSpeedForScore(scoreRef.current);

    const nextPipes = [];
    for (let i = 0; i < pipesRef.current.length; i += 1) {
      const pipe = pipesRef.current[i];
      const movedX = pipe.x - pipeSpeed * dt * direction;
        const gapTop = pipe.gapY + PIPE_GAP / 2;
        const gapBottom = pipe.gapY - PIPE_GAP / 2;

        const overlapsPipeX = Math.abs(movedX - currentBirdX) <= PIPE_WIDTH / 2 + BIRD_RADIUS;
        const hitsGap = y + BIRD_RADIUS < gapTop && y - BIRD_RADIUS > gapBottom;

        if (modeSwitchSafeRef.current <= 0 && overlapsPipeX && !hitsGap) {
          crash();
        }

        let passed = pipe.passed;
        const passedNormal = movedX + PIPE_WIDTH / 2 < currentBirdX;
        const passedReverse = movedX - PIPE_WIDTH / 2 > currentBirdX;
        if (!passed && ((direction === 1 && passedNormal) || (direction === -1 && passedReverse))) {
          passed = true;
          nextScore += 1;
        }

      if ((direction === 1 && movedX > pipeDespawnX) || (direction === -1 && movedX < pipeDespawnX)) {
        nextPipes.push({ ...pipe, x: movedX, passed });
      }
    }

    const nextEffects = [];
    for (let i = 0; i < effectsRef.current.length; i += 1) {
      const item = effectsRef.current[i];
      const movedX = item.x - pipeSpeed * dt * direction;
      const closeX = Math.abs(movedX - currentBirdX) < 0.56;
      const closeY = Math.abs(item.y - y) < 0.56;

      if (closeX && closeY) {
        applyEffect(item.effect);
        continue;
      }

      const inBounds =
        (direction === 1 && movedX > pipeDespawnX) || (direction === -1 && movedX < pipeDespawnX);
      if (inBounds) {
        nextEffects.push({ ...item, x: movedX });
      }
    }

    if (nextScore !== scoreRef.current) {
      scoreRef.current = nextScore;
      setScore(nextScore);
    }

    pipesRef.current = nextPipes;
    effectsRef.current = nextEffects;
    setBirdX(currentBirdX);
    setBirdY(y);
    setPipes(nextPipes);
    setEffects(nextEffects);
  });

  const renderedPipes = useMemo(
    () => pipes.map((pipe) => <PipePair key={pipe.id} x={pipe.x} gapY={pipe.gapY} />),
    [pipes]
  );
  const renderedEffects = useMemo(
    () => effects.map((item) => <EffectMarker key={item.id} x={item.x} y={item.y} effect={item.effect} />),
    [effects]
  );

  return (
    <group>
      <ambientLight intensity={1.1} />
      <directionalLight position={[5, 6, 4]} intensity={1.4} />
      <World />
      {renderedPipes}
      {renderedEffects}
      {cameraMode === 'pov' && phase === 'playing' && <PovBillions flightMode={flightMode} />}
      {phase === 'playing' && (
        <SpeedTrails
          birdXRef={birdXRef}
          birdYRef={birdYRef}
          birdZRef={birdZRef}
          velocityRef={velocityRef}
          phaseRef={phaseRef}
          flightModeRef={flightModeRef}
        />
      )}
      <Bird
        x={birdX}
        y={birdY}
        z={birdZ}
        phase={phase}
        rotationY={phase === 'playing' || phase === 'starting' ? (flightMode === 'reverse' ? Math.PI : 0) : null}
      />
    </group>
  );
}
