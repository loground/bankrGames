import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html, Trail, useGLTF, useProgress } from '@react-three/drei';
import { BackSide } from 'three';
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
const FLAPPY_CHARACTERS = [
  { id: 'bankr', path: '/3d/bankr3_opt.glb', animationMap: { ready: 0, playing: 2, gameover: 1 }, positionOffset: [0, 0, 0], rotationOffsetY: 0 },
  { id: 'deployer', path: '/3d/flappy/deployer.glb', animationMap: { ready: 2, playing: 1, gameover: 0 }, positionOffset: [-0.2, 0, 0], rotationOffsetY: 0 },
  { id: 'thosmur', path: '/3d/flappy/thosmur.glb', animationMap: { ready: 1, starting: 1, playing: 0, gameover: 2 }, positionOffset: [0, 0, 0], rotationOffsetY: -Math.PI / 2 },
];
const CHARACTER_TRANSITION_MS = 220;

FLAPPY_CHARACTERS.forEach((character) => {
  useGLTF.preload(character.path);
});

const DEPLOYER_BACKGROUND_SHADER = `
precision highp float;
varying vec2 vUv;
uniform float iTime;
uniform vec2 iResolution;

float map(in vec3 p)
{
  vec3 q = mod(p + 2.0, 4.0) - 2.0;
  float d1 = length(q) - 1.0;
  d1 += 0.1*sin(10.0*p.x)*sin(10.0*p.y + iTime)*sin(10.0*p.z);
  float d2 = p.y + 1.0;
  float k = 1.5;
  float h = clamp(0.5 + 0.5*(d1-d2)/k, 0.0, 1.0);
  return mix(d1, d2, h) - k*h*(1.0-h);
}

vec3 calcNormal(in vec3 p)
{
  vec2 e = vec2(0.0001, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)
  ));
}

void main()
{
  vec2 fragCoord = vUv * iResolution;
  vec2 uv = fragCoord.xy / iResolution.xy;
  vec2 p = -1.0 + 2.0*uv;
  p.x *= iResolution.x/iResolution.y;
  vec3 ro = vec3(0.0, 0.0, 2.0);
  vec3 rd = normalize(vec3(p, -1.0));
  vec3 col = vec3(0.0);
  float tmax = 20.0;
  float h = 1.0;
  float t = 0.0;

  for(int i=0; i<100; i++)
  {
    if(h < 0.0001 || t > tmax) break;
    h = map(ro + t*rd);
    t += h;
  }

  vec3 lig = vec3(0.5773);
  if(t < tmax)
  {
    vec3 pos = ro + t*rd;
    vec3 nor = calcNormal(pos);
    col = vec3(1.0, 0.8, 0.5)*clamp(dot(nor, lig), 0.0, 1.0);
    col += vec3(0.2, 0.3, 0.4)*clamp(nor.y, 0.0, 1.0);
    col += vec3(1.0, 0.7, 0.2)*clamp(1.0 + dot(rd, nor), 0.0, 1.0);
    col *= 0.8;
    col *= exp(-0.1*t);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

const THOSMUR_BACKGROUND_SHADER = `
precision highp float;
varying vec2 vUv;
uniform float iTime;
uniform vec2 iResolution;

vec2 rotate(vec2 p, float a)
{
  return vec2(p.x * cos(a) - p.y * sin(a), p.x * sin(a) + p.y * cos(a));
}

float hash2v(vec2 p)
{
  return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453);
}

float noise(vec2 p)
{
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  float a = hash2v(i);
  float b = hash2v(i + vec2(1.0, 0.0));
  float c = hash2v(i + vec2(0.0, 1.0));
  float d = hash2v(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p)
{
  float v = 0.0;
  float a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = r * p * 2.0;
    a *= 0.5;
  }
  return v;
}

void main()
{
  vec2 uv = vUv * 2.0 - 1.0;
  uv.x *= iResolution.x / iResolution.y;
  uv = rotate(uv, sin(iTime * 0.22) * 0.3);

  float ring = abs(length(uv) - 0.55);
  float tunnel = smoothstep(0.25, 0.0, ring);
  float wisps = fbm(uv * 3.6 + vec2(iTime * 0.4, -iTime * 0.22));
  float streaks = fbm(uv * 7.4 + vec2(iTime * 0.9, iTime * 0.35));
  float glow = smoothstep(0.0, 1.0, wisps * 1.2 + streaks * 0.45) * tunnel;

  vec3 bg = vec3(0.14, 0.07, 0.18);
  vec3 tint = vec3(0.95, 0.45, 0.22);
  vec3 col = bg + glow * tint;
  col += vec3(0.6, 0.25, 0.15) * exp(-8.0 * ring * ring);
  gl_FragColor = vec4(col, 1.0);
}
`;

function FlappyBackgroundShader({ variant = 'bankr', targetOpacity = 1 }) {
  const materialRef = useRef(null);
  const meshRef = useRef(null);
  const opacityRef = useRef(targetOpacity);
  const { camera, size } = useThree();

  const uniforms = useMemo(
    () => ({
      iTime: { value: 0 },
      iResolution: { value: [size.width, size.height] },
    }),
    [size.height, size.width]
  );

  useEffect(() => {
    uniforms.iResolution.value = [size.width, size.height];
  }, [size.height, size.width, uniforms]);

  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.position.copy(camera.position);
    }
    if (!materialRef.current) {
      return;
    }
    materialRef.current.uniforms.iTime.value = state.clock.elapsedTime;
    const nextOpacity = opacityRef.current + (targetOpacity - opacityRef.current) * Math.min(1, delta * 9);
    opacityRef.current = nextOpacity;
    materialRef.current.opacity = nextOpacity;
  });

  if (variant === 'deployer' || variant === 'thosmur') {
    return (
      <mesh ref={meshRef} key={`flappy-bg-${variant}`}>
        <sphereGeometry args={[120, 48, 32]} />
        <shaderMaterial
          key={`flappy-bg-material-${variant}`}
          ref={materialRef}
          uniforms={uniforms}
          side={BackSide}
          transparent
          opacity={targetOpacity}
          depthWrite={false}
          vertexShader={`
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `}
          fragmentShader={variant === 'deployer' ? DEPLOYER_BACKGROUND_SHADER : THOSMUR_BACKGROUND_SHADER}
        />
      </mesh>
    );
  }

  return (
    <mesh ref={meshRef} key={`flappy-bg-${variant}`}>
      <sphereGeometry args={[120, 48, 32]} />
      <shaderMaterial
        key={`flappy-bg-material-${variant}`}
        ref={materialRef}
        uniforms={uniforms}
        side={BackSide}
        transparent
        opacity={targetOpacity}
        depthWrite={false}
        vertexShader={`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          precision highp float;
          varying vec2 vUv;
          uniform float iTime;
          uniform vec2 iResolution;
          float time;

          vec2 hash2(vec2 p)
          {
            // texture based white noise (reference)
            // return textureLod(iChannel0, (p+0.5)/256.0, 0.0).xy;
            // procedural white noise fallback
            return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453);
          }

          vec3 voronoi(in vec2 x)
          {
            vec2 n = floor(x);
            vec2 f = fract(x);

            vec2 mg, mr;
            float md = 8.0;
            for (int j = -1; j <= 1; j++)
            for (int i = -1; i <= 1; i++)
            {
              vec2 g = vec2(float(i), float(j));
              vec2 o = hash2(n + g);
              o = 0.5 + 0.5 * sin(0.1*iTime + 6.2831*o);
              vec2 r = g + o - f;
              float d = dot(r,r);

              if (d < md)
              {
                md = d;
                mr = r;
                mg = g;
              }
            }

            md = 8.0;
            for (int j = -2; j <= 2; j++)
            for (int i = -2; i <= 2; i++)
            {
              vec2 g = mg + vec2(float(i), float(j));
              vec2 o = hash2(n + g);
              o = 0.5 + 0.5 * sin(0.1*iTime + 6.2831*o);
              vec2 r = g + o - f;

              if (dot(mr-r,mr-r) > 0.00001)
                md = min(md, dot(0.5*(mr+r), normalize(r-mr)));
            }

            return vec3(md, mr);
          }

          const mat2 m = mat2(0.80, 0.60, -0.60, 0.80);

          float noise(in vec2 p)
          {
            return sin(p.x*10.0) * sin(p.y*(3.0 + sin(time/11.0))) + 0.2;
          }

          mat2 rotate(float angle)
          {
            return mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
          }

          float fbm(vec2 p)
          {
            p *= 1.1;
            float f = 0.0;
            float amp = 0.5;
            for (int i = 0; i < 3; i++) {
              mat2 modify = rotate(time/50.0 * float(i*i));
              f += amp * noise(p);
              p = modify * p;
              p *= 2.0;
              amp /= 2.2;
            }
            return f;
          }

          float pattern(vec2 p, out vec2 q, out vec2 r) {
            q = vec2(fbm(p + vec2(1.0)), fbm(rotate(0.1*time)*p + vec2(1.0)));
            r = vec2(fbm(rotate(0.1)*q + vec2(0.0)), fbm(q + vec2(0.0)));
            return fbm(p + 1.0*r);
          }

          float letterBANKR(vec2 g, float id) {
            float on = 0.0;
            float x = g.x;
            float y = g.y;

            if (id < 1.0) { // B
              if (x < 0.5 || (y < 0.5 || abs(y-2.0) < 0.5 || abs(y-4.0) < 0.5) && x < 4.5 || abs(x-4.0) < 0.5 && (y > 0.5 && y < 1.5 || y > 2.5 && y < 3.5)) on = 1.0;
            } else if (id < 2.0) { // A
              if ((x < 0.5 || abs(x-4.0)<0.5) && y > 0.5) on = 1.0;
              if (y < 0.5 || abs(y-2.0)<0.5) on = 1.0;
            } else if (id < 3.0) { // N
              if (x < 0.5 || abs(x-4.0)<0.5 || abs(x-y) < 0.5) on = 1.0;
            } else if (id < 4.0) { // K
              if (x < 0.5 || abs(x+y-2.0)<0.5 || abs(x-(y-2.0))<0.5) on = 1.0;
            } else { // R
              if (x < 0.5 || y < 0.5 || abs(y-2.0)<0.5) on = 1.0;
              if (abs(x-4.0)<0.5 && y < 2.0) on = 1.0;
              if (abs(x-(y-1.0))<0.5 && y > 2.0) on = 1.0;
            }
            return on;
          }

          float sampleFont(vec2 p, float num) {
            return letterBANKR(p, mod(floor(num), 5.0));
          }

          float digit(vec2 p){
            p -= vec2(0.5, 0.5);
            p *= (1.0 + 0.15*pow(length(p),0.6));
            p += vec2(0.5, 0.5);

            p.x += sin(iTime/7.0)/5.0;
            p.y += sin(iTime/13.0)/5.0;

            vec2 grid = vec2(3.0,1.0) * 15.0;
            vec2 s = floor(p * grid) / grid;
            p = p * grid;
            vec2 q;
            vec2 r;
            float intensity = pattern(s/10.0, q, r)*1.3 - 0.03;
            p = fract(p);
            p *= vec2(1.2, 1.2);
            float x = fract(p.x * 5.0);
            float y = fract((1.0 - p.y) * 5.0);
            vec2 fpos = vec2(floor(p.x * 5.0), floor((1.0 - p.y) * 5.0));
            float isOn = sampleFont(fpos, floor(intensity*10.0));
            return p.x <= 1.0 && p.y <= 1.0 ? isOn * (0.2 + y*4.0/5.0) * (0.75 + x/4.0) : 0.0;
          }

          float hash(float x){
            return fract(sin(x*234.1)*324.19 + sin(sin(x*3214.09)*34.132*x) + x*234.12);
          }

          float onOff(float a, float b, float c)
          {
            return step(c, sin(iTime + a*cos(iTime*b)));
          }

          float displace(vec2 look)
          {
            float y = (look.y - mod(iTime/4.0,1.0));
            float window = 1.0/(1.0 + 50.0*y*y);
            return sin(look.y*20.0 + iTime)/80.0 * onOff(4.0,2.0,0.8) * (1.0 + cos(iTime*60.0)) * window;
          }

          vec3 getColor(vec2 p){
            float bar = mod(p.y + time*20.0, 1.0) < 0.2 ? 1.4 : 1.0;
            p.x += displace(p);
            float middle = digit(p);
            float off = 0.002;
            float sum = 0.0;
            for (float i = -1.0; i < 2.0; i += 1.0){
              for (float j = -1.0; j < 2.0; j += 1.0){
                sum += digit(p + vec2(off*i, off*j));
              }
            }
            return vec3(0.9)*middle + sum/10.0*vec3(0.0,1.0,0.0)*bar;
          }

          void main() {
            vec2 fragCoord = vUv * iResolution;
            time = iTime / 3.0;
            vec2 p = fragCoord / iResolution.xy;
            vec3 col = getColor(p);
            gl_FragColor = vec4(col,1.0);
          }
        `}
      />
    </mesh>
  );
}

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
  const textRef = useRef(null);
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

  useFrame((state) => {
    if (!textRef.current) {
      return;
    }
    textRef.current.position.y = 1.2 + Math.sin(state.clock.elapsedTime * 1.8) * 0.18;
  });

  return (
    <mesh
      ref={textRef}
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

function SelectorArrow({ position, direction = 'left', onSelect }) {
  return (
    <group
      position={position}
      onPointerDown={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <mesh rotation={[0, 0, direction === 'left' ? Math.PI / 2 : -Math.PI / 2]}>
        <coneGeometry args={[0.28, 0.62, 3]} />
        <meshStandardMaterial color="#fedb48" emissive="#f59e0b" emissiveIntensity={0.35} />
      </mesh>
      <mesh>
        <boxGeometry args={[0.95, 1.05, 0.95]} />
        <meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

function CharacterSelector({ visible, isMobile = false, onPrev, onNext }) {
  if (!visible) {
    return null;
  }

  const offsetX = isMobile ? 2.15 : 2.9;

  return (
    <group>
      <SelectorArrow position={[-offsetX, 0.05, 0]} direction="left" onSelect={onPrev} />
      <SelectorArrow position={[offsetX, 0.05, 0]} direction="right" onSelect={onNext} />
    </group>
  );
}

function CharacterModelFallback({ x, y, z }) {
  const { progress } = useProgress();

  return (
    <Html center position={[x, y, z]}>
      <div className="model-loader-card">Loading Character: {Math.round(progress)}%</div>
    </Html>
  );
}

export function FlappyCameraRig({
  phase,
  isMobile,
  cameraMode = 'default',
  flightMode = 'normal',
  povMobileCamSettings = null,
}) {
  const { camera } = useThree();
  const chasePosRef = useRef(null);
  const prevViewKeyRef = useRef('');

  useEffect(() => {
    const viewKey = `${cameraMode}:${flightMode}:${phase}:${isMobile}`;
    if (prevViewKeyRef.current !== viewKey) {
      chasePosRef.current = null;
      prevViewKeyRef.current = viewKey;
    }

    const baseZ = isMobile ? 10 : 8;
    const playingZ = isMobile ? baseZ * 1.05 : baseZ;
    const direction = flightMode === 'reverse' ? -1 : 1;
    const birdX = flightMode === 'reverse' ? -BIRD_X : BIRD_X;

    if (cameraMode === 'pov' && phase === 'playing') {
      const modeKey = flightMode === 'reverse' ? 'reverse' : 'normal';
      const savedMobilePreset = povMobileCamSettings?.[modeKey];
      const mobilePreset = savedMobilePreset;

      const useMobilePreset = isMobile && mobilePreset;
      const backOffset = useMobilePreset ? mobilePreset.backOffset : isMobile ? 1.25 : 2.4;
      const lookAhead = useMobilePreset ? mobilePreset.lookAhead : isMobile ? 3.4 : 6.0;
      const targetX = birdX - direction * backOffset;
      const targetY = useMobilePreset ? mobilePreset.targetY : isMobile ? 1 : 0.95;
      const targetZ = useMobilePreset ? mobilePreset.targetZ : isMobile ? 1.15 : 2.25;
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
      camera.fov = useMobilePreset ? mobilePreset.fov : isMobile ? 110 : 72;
      camera.updateProjectionMatrix();
      camera.lookAt(birdX + direction * lookAhead, isMobile ? 0.2 : 0.24, 0);
      return;
    }

    chasePosRef.current = null;
    camera.fov = 44;
    camera.updateProjectionMatrix();
    camera.position.set(0, 0, phase === 'playing' ? playingZ : baseZ);
    camera.lookAt(0, 0, 0);
  }, [camera, cameraMode, flightMode, isMobile, phase, povMobileCamSettings]);

  return null;
}

export default function FlappyGameScene({
  phase,
  setPhase,
  score,
  setScore,
  isMobile = false,
  flightMode = 'normal',
  setFlightMode,
  cameraMode = 'default',
  setCameraMode,
  onCharacterChange = null,
}) {
  const [activeCharacterIndex, setActiveCharacterIndex] = useState(0);
  const [previousCharacterIndex, setPreviousCharacterIndex] = useState(null);
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
  const suppressNextActionRef = useRef(false);
  const characterTransitionTimerRef = useRef(null);

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

  useEffect(
    () => () => {
      if (characterTransitionTimerRef.current) {
        clearTimeout(characterTransitionTimerRef.current);
      }
    },
    []
  );

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
    if (suppressNextActionRef.current) {
      suppressNextActionRef.current = false;
      return;
    }

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
      if (suppressNextActionRef.current) {
        suppressNextActionRef.current = false;
        return;
      }
      onAction();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [onAction]);

  const switchCharacter = useCallback((step) => {
    if (phaseRef.current === 'playing' || phaseRef.current === 'starting') {
      return;
    }
    suppressNextActionRef.current = true;
    setActiveCharacterIndex((current) => {
      const next = (current + step + FLAPPY_CHARACTERS.length) % FLAPPY_CHARACTERS.length;
      if (next === current) {
        return current;
      }

      setPreviousCharacterIndex(current);
      if (characterTransitionTimerRef.current) {
        clearTimeout(characterTransitionTimerRef.current);
      }
      characterTransitionTimerRef.current = setTimeout(() => {
        setPreviousCharacterIndex(null);
        characterTransitionTimerRef.current = null;
      }, CHARACTER_TRANSITION_MS);
      return next;
    });
  }, []);

  const activeCharacter = FLAPPY_CHARACTERS[activeCharacterIndex];
  const previousCharacter = previousCharacterIndex !== null ? FLAPPY_CHARACTERS[previousCharacterIndex] : null;

  useEffect(() => {
    if (typeof onCharacterChange === 'function') {
      onCharacterChange(activeCharacter.id);
    }
  }, [activeCharacter.id, onCharacterChange]);
  const getPhaseCharacterRotation = useCallback(
    (character) => {
      if (!character) {
        return 0;
      }
      if (character.id === 'thosmur' && (phase === 'starting' || phase === 'playing')) {
        return (character.rotationOffsetY ?? 0) + Math.PI / 2;
      }
      return character.rotationOffsetY ?? 0;
    },
    [phase]
  );

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
      {previousCharacter && <FlappyBackgroundShader variant={previousCharacter.id} targetOpacity={0} />}
      <FlappyBackgroundShader variant={activeCharacter.id} targetOpacity={1} />
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
      <CharacterSelector
        visible={phase === 'ready'}
        isMobile={isMobile}
        onPrev={() => switchCharacter(-1)}
        onNext={() => switchCharacter(1)}
      />
      {previousCharacter && (
        <Html center position={[0, isMobile ? 2.2 : 2.6, 0]}>
          <div className="model-loader-card">Switching character...</div>
        </Html>
      )}
      {previousCharacter && (
        <Suspense fallback={null}>
          <Bird
            x={birdX}
            y={birdY}
            z={birdZ}
            phase={phase}
            modelPath={previousCharacter.path}
            animationMap={previousCharacter.animationMap}
            positionOffset={previousCharacter.positionOffset}
            rotationOffsetY={getPhaseCharacterRotation(previousCharacter)}
            targetOpacity={0}
            rotationY={phase === 'playing' || phase === 'starting' ? (flightMode === 'reverse' ? Math.PI : 0) : null}
          />
        </Suspense>
      )}
      <Suspense fallback={<CharacterModelFallback x={birdX} y={birdY} z={birdZ} />}>
        <Bird
          x={birdX}
          y={birdY}
          z={birdZ}
          phase={phase}
          modelPath={activeCharacter.path}
          animationMap={activeCharacter.animationMap}
          positionOffset={activeCharacter.positionOffset}
          rotationOffsetY={getPhaseCharacterRotation(activeCharacter)}
          targetOpacity={1}
          rotationY={phase === 'playing' || phase === 'starting' ? (flightMode === 'reverse' ? Math.PI : 0) : null}
        />
      </Suspense>
    </group>
  );
}
