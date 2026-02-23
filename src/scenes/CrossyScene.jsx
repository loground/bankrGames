import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import helvetikerFont from 'three/examples/fonts/helvetiker_bold.typeface.json';
import Bird from '../components/Bird';
import {
  CROSSY_GROUND_Y,
  CROSSY_LANES,
  CROSSY_MAX_X,
  CROSSY_MIN_X,
  CROSSY_MIN_Z,
  CROSSY_MODEL_Y,
  CROSSY_PLAYER_START_X,
  CROSSY_PLAYER_START_Z,
  CROSSY_STEP,
  FLOOR_Y,
  INTRO_BIRD_Y,
  INTRO_BIRD_Z,
  getCrossySpeedMultiplier,
} from '../constants/gameConstants';

const CROSSY_LANE_WIDTH = 14;
const CROSSY_ROAD_WIDTH = 22;
const CROSSY_TRAFFIC_WRAP_X = 10.5;
const CROSSY_TRAFFIC_SPACING = 6;
const CROSSY_CARS_PER_LANE = 2;
const CROSSY_FOG_COLOR = '#2b1448';
const CROSSY_BG_COLOR = '#140a24';

function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 900);

  useEffect(() => {
    const onResize = () => {
      setIsMobile(window.innerWidth <= 900);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return isMobile;
}

function World() {
  return (
    <>
      <mesh position={[0, FLOOR_Y - 0.15, 0]}>
        <boxGeometry args={[36, 0.3, 1]} />
        <meshStandardMaterial color="#4b5563" />
      </mesh>
      <mesh position={[0, -4.6, -0.2]}>
        <boxGeometry args={[36, 2, 0.5]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
    </>
  );
}

export function CrossyMenuScene() {
  const isMobile = useIsMobileViewport();

  const heroX = isMobile ? -0.38 : -1.024;
  const enemyX = isMobile ? 0.38 : 0.98;

  return (
    <group>
      <color attach="background" args={[CROSSY_BG_COLOR]} />
      <fog attach="fog" args={[CROSSY_FOG_COLOR, 8, 18]} />
      <ambientLight intensity={1.1} />
      <directionalLight position={[5, 6, 4]} intensity={1.4} />
      <pointLight position={[0, CROSSY_GROUND_Y + 1.8, -8]} color="#b06bff" intensity={1.1} distance={30} />
      <World />
      <Bird x={heroX} y={INTRO_BIRD_Y} z={INTRO_BIRD_Z} phase="ready" modelPath="/3d/bankrX_opt.glb" clipOverride={2} />
      <Bird
        x={enemyX}
        y={INTRO_BIRD_Y}
        z={INTRO_BIRD_Z}
        phase="ready"
        modelPath="/3d/enemy1_opt.glb"
        clipOverride={2}
      />
    </group>
  );
}

export function CrossyMenuCamera() {
  const { camera } = useThree();
  const isMobile = useIsMobileViewport();

  useEffect(() => {
    camera.position.set(0, 0, isMobile ? 9.2 : 8);
    camera.lookAt(0, 0, 0);
  }, [camera, isMobile]);

  return null;
}

function CrossyCameraRig() {
  const { camera, gl } = useThree();
  const controlsRef = useRef(null);
  const isMobile = useIsMobileViewport();

  useEffect(() => {
    camera.position.set(0, CROSSY_GROUND_Y + (isMobile ? 6.3 : 5.6), isMobile ? 10.4 : 8.2);
    camera.lookAt(0, CROSSY_GROUND_Y + 0.6, -2.4);

    const controls = new OrbitControls(camera, gl.domElement);
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minAzimuthAngle = -0.22;
    controls.maxAzimuthAngle = 0.22;
    controls.minPolarAngle = 0.92;
    controls.maxPolarAngle = 1.2;
    controls.target.set(0, CROSSY_GROUND_Y + 0.6, -2.4);
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

function FinishWord() {
  const geometry = useMemo(() => {
    const font = new FontLoader().parse(helvetikerFont);
    const textGeometry = new TextGeometry('BILLIONS', {
      font,
      size: 0.55,
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

  return (
    <mesh position={[0, CROSSY_GROUND_Y + 0.22, CROSSY_MIN_Z - 0.6]} geometry={geometry}>
      <meshStandardMaterial color="#F87B4A" metalness={0.35} roughness={0.4} />
    </mesh>
  );
}

function createCrossyCars() {
  const cars = [];
  CROSSY_LANES.forEach((lane, laneIndex) => {
    for (let i = 0; i < CROSSY_CARS_PER_LANE; i += 1) {
      cars.push({
        id: `${laneIndex}-${i}`,
        laneIndex,
        x: -8 + i * CROSSY_TRAFFIC_SPACING + laneIndex * 0.6,
        hit: false,
      });
    }
  });
  return cars;
}

export function CrossyGameScene({ mode, setMode, score, setScore, level, onLevelComplete }) {
  const [playerX, setPlayerX] = useState(CROSSY_PLAYER_START_X);
  const [playerZ, setPlayerZ] = useState(CROSSY_PLAYER_START_Z);
  const [cars, setCars] = useState(() => createCrossyCars());
  const [playerHit, setPlayerHit] = useState(false);

  const playerXRef = useRef(CROSSY_PLAYER_START_X);
  const playerZRef = useRef(CROSSY_PLAYER_START_Z);
  const carsRef = useRef(createCrossyCars());
  const modeRef = useRef(mode);
  const scoreRef = useRef(score);
  const hitLockRef = useRef(false);
  const levelCompleteRef = useRef(false);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  const movePlayer = useCallback(
    (direction) => {
      if (modeRef.current !== 'playing' || hitLockRef.current) {
        return;
      }

      let nextX = playerXRef.current;
      let nextZ = playerZRef.current;

      if (direction === 'left') {
        nextX -= CROSSY_STEP;
      } else if (direction === 'right') {
        nextX += CROSSY_STEP;
      } else if (direction === 'up') {
        nextZ -= CROSSY_STEP;
      } else if (direction === 'down') {
        nextZ += CROSSY_STEP;
      } else {
        return;
      }

      nextX = Math.max(CROSSY_MIN_X, Math.min(CROSSY_MAX_X, nextX));
      nextZ = Math.max(CROSSY_MIN_Z, Math.min(CROSSY_PLAYER_START_Z, nextZ));

      playerXRef.current = nextX;
      playerZRef.current = nextZ;
      setPlayerX(nextX);
      setPlayerZ(nextZ);

      const progress = Math.max(0, Math.floor((CROSSY_PLAYER_START_Z - nextZ) / CROSSY_STEP));
      if (progress > scoreRef.current) {
        scoreRef.current = progress;
        setScore(progress);
      }

      if (nextZ <= CROSSY_MIN_Z && !levelCompleteRef.current) {
        levelCompleteRef.current = true;
        hitLockRef.current = true;
        setMode('levelup');
        onLevelComplete();
      }
    },
    [onLevelComplete, setMode, setScore]
  );

  useEffect(() => {
    const onKeyDown = (event) => {
      const key = event.key.toLowerCase();
      let direction = null;

      if (key === 'arrowleft' || key === 'a') {
        direction = 'left';
      } else if (key === 'arrowright' || key === 'd') {
        direction = 'right';
      } else if (key === 'arrowup' || key === 'w') {
        direction = 'up';
      } else if (key === 'arrowdown' || key === 's') {
        direction = 'down';
      }

      if (!direction) {
        return;
      }

      event.preventDefault();
      movePlayer(direction);
    };

    let startX = 0;
    let startY = 0;

    const onTouchStart = (event) => {
      if (event.touches.length !== 1) {
        return;
      }
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
    };

    const onTouchEnd = (event) => {
      if (!startX && !startY) {
        return;
      }

      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      const minSwipe = 24;

      if (absX < minSwipe && absY < minSwipe) {
        startX = 0;
        startY = 0;
        return;
      }

      if (absX > absY) {
        movePlayer(deltaX > 0 ? 'right' : 'left');
      } else {
        movePlayer(deltaY > 0 ? 'down' : 'up');
      }

      startX = 0;
      startY = 0;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [movePlayer]);

  useFrame((_, delta) => {
    const nextCars = carsRef.current.map((car) => {
      if (modeRef.current !== 'playing' || car.hit) {
        return car;
      }

      const lane = CROSSY_LANES[car.laneIndex];
      const speedMultiplier = getCrossySpeedMultiplier(level);
      let x = car.x + lane.speed * speedMultiplier * lane.direction * delta;

      if (x > CROSSY_TRAFFIC_WRAP_X) {
        x = -CROSSY_TRAFFIC_WRAP_X;
      } else if (x < -CROSSY_TRAFFIC_WRAP_X) {
        x = CROSSY_TRAFFIC_WRAP_X;
      }

      return { ...car, x };
    });

    if (modeRef.current === 'playing' && !hitLockRef.current) {
      let hitCarId = null;

      for (let i = 0; i < nextCars.length; i += 1) {
        const car = nextCars[i];
        const lane = CROSSY_LANES[car.laneIndex];
        const closeX = Math.abs(car.x - playerXRef.current) < 0.75;
        const closeZ = Math.abs(lane.z - playerZRef.current) < 0.45;

        if (closeX && closeZ) {
          hitCarId = car.id;
          break;
        }
      }

      if (hitCarId) {
        hitLockRef.current = true;
        setPlayerHit(true);
        setMode('gameover');

        for (let i = 0; i < nextCars.length; i += 1) {
          if (nextCars[i].id === hitCarId) {
            nextCars[i] = { ...nextCars[i], hit: true };
            break;
          }
        }
      }
    }

    carsRef.current = nextCars;
    setCars(nextCars);
  });

  const laneMeshes = useMemo(
    () =>
      CROSSY_LANES.map((lane) => (
        <mesh key={lane.z} position={[0, CROSSY_GROUND_Y - 0.15, lane.z]}>
          <boxGeometry args={[CROSSY_LANE_WIDTH, 0.15, 0.85]} />
          <meshStandardMaterial color="#1e293b" />
        </mesh>
      )),
    []
  );

  const simpleObjects = useMemo(
    () => [
      [-3.8, CROSSY_GROUND_Y + 0.3, 2.5],
      [3.8, CROSSY_GROUND_Y + 0.3, 1.5],
      [3.8, CROSSY_GROUND_Y + 0.3, -1.8],
    ],
    []
  );

  return (
    <group>
      <color attach="background" args={[CROSSY_BG_COLOR]} />
      <fog attach="fog" args={[CROSSY_FOG_COLOR, 6.5, 20]} />
      <CrossyCameraRig />
      <ambientLight intensity={1.1} />
      <directionalLight position={[5, 6, 4]} intensity={1.4} />
      <directionalLight position={[0, CROSSY_GROUND_Y + 3.5, -10]} color="#8f5cff" intensity={0.7} />
      <pointLight position={[0, CROSSY_GROUND_Y + 2, -10]} color="#b06bff" intensity={1.25} distance={34} />

      <mesh position={[0, CROSSY_GROUND_Y - 0.3, -1.5]}>
        <boxGeometry args={[CROSSY_ROAD_WIDTH, 0.4, 16]} />
        <meshStandardMaterial color="#475569" />
      </mesh>

      {laneMeshes}

      {simpleObjects.map((obj, index) => (
        <mesh key={`obj-${index}`} position={obj}>
          <boxGeometry args={[0.7, 0.7, 0.7]} />
          <meshStandardMaterial color={index % 2 === 0 ? '#94a3b8' : '#cbd5e1'} />
        </mesh>
      ))}

      <FinishWord />

      <Bird
        x={playerX}
        y={CROSSY_MODEL_Y}
        z={playerZ}
        phase="playing"
        modelPath="/3d/bankrX_opt.glb"
        clipOverride={playerHit ? 1 : 0}
        rotationY={Math.PI / 2}
      />

      {cars.map((car) => {
        const lane = CROSSY_LANES[car.laneIndex];
        return (
          <Bird
            key={car.id}
            x={car.x}
            y={CROSSY_MODEL_Y * 1.05}
            z={lane.z}
            phase="playing"
            modelPath="/3d/enemy1_opt.glb"
            clipOverride={car.hit ? 0 : 1}
            rotationY={lane.direction === -1 ? Math.PI : 0}
          />
        );
      })}
    </group>
  );
}
