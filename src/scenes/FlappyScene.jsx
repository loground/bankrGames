import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Trail } from '@react-three/drei';
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
  PIPE_WIDTH,
  STARTING_DURATION,
  WORLD_TOP,
  getPipeSpeedForScore,
  makePipe,
} from '../constants/gameConstants';

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

function SpeedTrails({ birdXRef, birdYRef, birdZRef, velocityRef, phaseRef }) {
  const headARef = useRef(null);
  const headBRef = useRef(null);
  const headCRef = useRef(null);
  const headDRef = useRef(null);
  const headERef = useRef(null);
  const headFRef = useRef(null);
  const headGRef = useRef(null);
  const anchorYRef = useRef(null);
  const anchorZRef = useRef(null);

  useFrame((state) => {
    const moving = phaseRef.current === 'playing' || phaseRef.current === 'starting';
    const speed = Math.abs(velocityRef.current);
    const power = moving ? Math.min(1.35, speed / 4.6 + (phaseRef.current === 'starting' ? 0.18 : 0)) : 0;

    const baseX = birdXRef.current - 0.28 - power * 0.18;
    if (anchorYRef.current === null) {
      anchorYRef.current = birdYRef.current + 0.08;
    }
    if (anchorZRef.current === null) {
      anchorZRef.current = birdZRef.current;
    }
    const yFollow = velocityRef.current < -0.35 ? 0.22 : 0.12;
    anchorYRef.current += (birdYRef.current + 0.08 - anchorYRef.current) * yFollow;
    anchorZRef.current += (birdZRef.current - anchorZRef.current) * 0.14;
    const baseY = anchorYRef.current;
    const baseZ = anchorZRef.current;
    const t = state.clock.elapsedTime;
    const active = power > 0.06;

    const heads = [
      headARef.current,
      headBRef.current,
      headCRef.current,
      headDRef.current,
      headERef.current,
      headFRef.current,
      headGRef.current,
    ];
    const yOffsets = [0, 0.05, -0.05, 0.09, -0.09, 0.02, -0.02];
    const zOffsets = [0, 0.025, -0.025, -0.05, 0.05, 0.07, -0.07];

    for (let i = 0; i < heads.length; i += 1) {
      const head = heads[i];
      if (!head) {
        continue;
      }

      const jitterY = Math.sin(t * (11 + i * 1.2) + i) * (0.002 + power * 0.006);
      const jitterZ = Math.cos(t * (9 + i * 1.1) + i * 0.7) * (0.004 + power * 0.009);
      const drag = i * (0.045 + power * 0.055);
      const xPulse = Math.sin(t * (22 + i * 2.1) + i * 0.4) * (0.02 + power * 0.1);

      head.position.set(
        baseX - drag - xPulse,
        baseY + yOffsets[i] * (1 + power * 0.08) + jitterY,
        baseZ + zOffsets[i] + jitterZ
      );
      head.scale.setScalar(0.44 + power * 0.82);
      head.visible = active;
    }
  });

  return (
    <>
      <Trail width={1.25} length={3.2} color="#93c5fd" attenuation={(value) => value * value}>
        <group ref={headARef} />
      </Trail>
      <Trail width={1.05} length={3} color="#67e8f9" attenuation={(value) => value * value}>
        <group ref={headBRef} />
      </Trail>
      <Trail width={1.05} length={3} color="#67e8f9" attenuation={(value) => value * value}>
        <group ref={headCRef} />
      </Trail>
      <Trail width={0.95} length={2.7} color="#c4b5fd" attenuation={(value) => value * value}>
        <group ref={headDRef} />
      </Trail>
      <Trail width={0.95} length={2.7} color="#c4b5fd" attenuation={(value) => value * value}>
        <group ref={headERef} />
      </Trail>
      <Trail width={0.82} length={2.3} color="#f0abfc" attenuation={(value) => value * value}>
        <group ref={headFRef} />
      </Trail>
      <Trail width={0.82} length={2.3} color="#f0abfc" attenuation={(value) => value * value}>
        <group ref={headGRef} />
      </Trail>
    </>
  );
}

export function FlappyCameraRig({ phase, isMobile }) {
  const { camera } = useThree();

  useEffect(() => {
    const baseZ = isMobile ? 10 : 8;
    const playingZ = isMobile ? baseZ * 1.05 : baseZ;
    camera.position.set(0, 0, phase === 'playing' ? playingZ : baseZ);
    camera.lookAt(0, 0, 0);
  }, [camera, isMobile, phase]);

  return null;
}

export default function FlappyGameScene({ phase, setPhase, score, setScore }) {
  const [birdY, setBirdY] = useState(INTRO_BIRD_Y);
  const [birdX, setBirdX] = useState(INTRO_BIRD_X);
  const [birdZ, setBirdZ] = useState(INTRO_BIRD_Z);
  const [pipes, setPipes] = useState([]);

  const birdYRef = useRef(INTRO_BIRD_Y);
  const birdXRef = useRef(INTRO_BIRD_X);
  const birdZRef = useRef(INTRO_BIRD_Z);
  const velocityRef = useRef(0);
  const pipesRef = useRef([]);
  const phaseRef = useRef(phase);
  const spawnTimerRef = useRef(0);
  const scoreRef = useRef(score);
  const pipeIdRef = useRef(0);
  const startProgressRef = useRef(0);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  const resetRound = useCallback(() => {
    birdYRef.current = INTRO_BIRD_Y;
    birdXRef.current = INTRO_BIRD_X;
    birdZRef.current = INTRO_BIRD_Z;
    velocityRef.current = 0;
    pipesRef.current = [];
    spawnTimerRef.current = 0;
    scoreRef.current = 0;
    startProgressRef.current = 0;
    pipeIdRef.current = 0;

    setBirdY(INTRO_BIRD_Y);
    setBirdX(INTRO_BIRD_X);
    setBirdZ(INTRO_BIRD_Z);
    setPipes([]);
    setScore(0);
    setPhase('ready');
  }, [setPhase, setScore]);

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

    if (phaseRef.current === 'starting') {
      startProgressRef.current = Math.min(startProgressRef.current + dt / STARTING_DURATION, 1);

      const t = startProgressRef.current;
      const nextX = INTRO_BIRD_X + (BIRD_X - INTRO_BIRD_X) * t;
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
        birdXRef.current = BIRD_X;
        birdZRef.current = 0;
        setBirdX(BIRD_X);
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
    birdXRef.current = BIRD_X;
    birdZRef.current = 0;

    if (y - BIRD_RADIUS <= FLOOR_Y || y + BIRD_RADIUS >= WORLD_TOP) {
      setBirdY(y);
      crash();
      return;
    }

    spawnTimerRef.current += dt;

    if (spawnTimerRef.current >= PIPE_SPAWN_SECONDS) {
      spawnTimerRef.current = 0;
      pipesRef.current = [...pipesRef.current, makePipe(pipeIdRef.current++)];
    }

    let nextScore = scoreRef.current;
    const pipeSpeed = getPipeSpeedForScore(scoreRef.current);

    const nextPipes = [];
    for (let i = 0; i < pipesRef.current.length; i += 1) {
      const pipe = pipesRef.current[i];
      const movedX = pipe.x - pipeSpeed * dt;
        const gapTop = pipe.gapY + PIPE_GAP / 2;
        const gapBottom = pipe.gapY - PIPE_GAP / 2;

        const overlapsPipeX = Math.abs(movedX - BIRD_X) <= PIPE_WIDTH / 2 + BIRD_RADIUS;
        const hitsGap = y + BIRD_RADIUS < gapTop && y - BIRD_RADIUS > gapBottom;

        if (overlapsPipeX && !hitsGap) {
          crash();
        }

        let passed = pipe.passed;
        if (!passed && movedX + PIPE_WIDTH / 2 < BIRD_X) {
          passed = true;
          nextScore += 1;
        }

      if (movedX > PIPE_DESPAWN_X) {
        nextPipes.push({ ...pipe, x: movedX, passed });
      }
    }

    if (nextScore !== scoreRef.current) {
      scoreRef.current = nextScore;
      setScore(nextScore);
    }

    pipesRef.current = nextPipes;
    setBirdY(y);
    setPipes(nextPipes);
  });

  const renderedPipes = useMemo(
    () => pipes.map((pipe) => <PipePair key={pipe.id} x={pipe.x} gapY={pipe.gapY} />),
    [pipes]
  );

  return (
    <group>
      <ambientLight intensity={1.1} />
      <directionalLight position={[5, 6, 4]} intensity={1.4} />
      <World />
      {renderedPipes}
      {phase === 'playing' && (
        <SpeedTrails
          birdXRef={birdXRef}
          birdYRef={birdYRef}
          birdZRef={birdZRef}
          velocityRef={velocityRef}
          phaseRef={phaseRef}
        />
      )}
      <Bird x={birdX} y={birdY} z={birdZ} phase={phase} />
    </group>
  );
}
