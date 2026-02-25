import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { Environment, Html, useProgress } from '@react-three/drei';
import { Box3, ShaderMaterial, Vector2, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

function MinerBackgroundShader() {
  const { size } = useThree();
  const materialRef = useRef(null);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uResolution: { value: new Vector2(size.width, size.height) },
          uMouse: { value: new Vector2(size.width * 0.5, size.height * 0.5) },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform vec2 uResolution;
          uniform vec2 uMouse;

          float n21(vec2 n)
          {
            return fract(sin(dot(n, vec2(12.9898,78.233))) * 43758.5453);
          }

          mat2 rot(float a)
          {
            return mat2(
              cos(a), -sin(a),
              sin(a), cos(a)
            );
          }

          float grid(vec2 uv)
          {
            return n21(uv) < .1 ? 1. : 0.;
          }

          float line_segment(vec2 uv, vec2 lo, vec2 ld)
          {
            uv -= lo;
            vec2 p = dot(uv, ld) / dot(ld, ld) * ld;
            float l = clamp(length(p), 0., length(ld));
            p = normalize(ld) * l;
            return length(p - uv);
          }

          vec2 line_intersect_line(vec2 s1, vec2 v1, vec2 s2, vec2 v2)
          {
            float b = (-s1.y - v1.y * ((s2.x - s1.x) / v1.x) + s2.y) / (v2.x / v1.x * v1.y - v2.y);
            return s2 + v2 * b;
          }

          void cube_line(vec2 n, out vec2 o, out vec2 d)
          {
            d = -n.yx;
            o = clamp(n, vec2(0, 0), vec2(1, 1));
          }

          bool traverse_voxel(vec2 ro, vec2 rd, out vec2 id, out vec2 p, out vec2 n)
          {
            const int len = 128;
            int x = int(floor(ro.x));
            int y = int(floor(ro.y));
            int stepX = int(sign(rd.x));
            int stepY = int(sign(rd.y));
            float tDeltaX = abs(rd.y);
            float tDeltaY = abs(rd.x);
            float tMaxX = tDeltaX - fract(ro.x * sign(rd.x)) * tDeltaX;
            float tMaxY = tDeltaY - fract(ro.y * sign(rd.y)) * tDeltaY;
            int status = -1;
            int i = 0;

            do {
              if(tMaxX < tMaxY) {
                tMaxX += tDeltaX;
                x += stepX;
                n = vec2(-stepX, 0);
              } else {
                tMaxY += tDeltaY;
                y += stepY;
                n = vec2(0, -stepY);
              }

              if (grid(vec2(x, y)) == 1.) {
                status = 0;
                id = vec2(x, y);
              }
            } while(status == -1 && i++ < len);

            if (status == 0) {
              vec2 lo, ld;
              cube_line(n, lo, ld);
              p = line_intersect_line(ro, rd, id + lo, ld);

              return true;
            }
            return false;
          }

          void bounce(vec2 uv, vec2 ro, vec2 rd, vec2 id, float scale, inout float hitAccum, inout float lineAccum)
          {
            for (int i = 1; i < 8; i++) {
              vec2 pid, p, n;
              hitAccum += traverse_voxel(ro, rd, pid, p, n) ? (id == pid ? 1. : 0.) : 0.;
              lineAccum += smoothstep(scale / uResolution.y * 2., .0, line_segment(uv, ro, rd * length(p - ro)));
              ro = p + n * .001;
              rd = reflect(rd, n);
            }
          }

          void main() {
            vec2 fragCoord = gl_FragCoord.xy;
            float scale = 32.;
            vec2 uv = fragCoord / uResolution.y * scale;
            vec2 id = floor(uv);
            vec3 bgCol = vec3(16.0, 32.0, 67.0) / 255.0;
            vec3 lineCol = vec3(255.0, 216.0, 0.0) / 255.0;
            vec3 blockCol = vec3(74.0, 124.0, 63.0) / 255.0;
            vec3 highlightCol = vec3(138.0, 105.0, 21.0) / 255.0;
            vec3 col = bgCol;

            vec2 ro = uMouse.xy / uResolution.y * scale + .001;
            vec2 rd = rot(uTime * .07) * normalize(vec2(5., 1.) + .001);

            float hitAccum = 0.;
            float lineAccum = 0.;
            float cursorGlow = smoothstep(.23, .2, length(uv - ro));

            col += grid(id) * blockCol * 0.75;
            col += cursorGlow * highlightCol;
            bounce(uv, ro, rd, id, scale, hitAccum, lineAccum);
            col += lineAccum * lineCol * 0.6;
            col += hitAccum * highlightCol * 0.55;

            gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
          }
        `,
        depthWrite: false,
        depthTest: false,
      }),
    [size.height, size.width]
  );

  useEffect(() => {
    if (!materialRef.current) {
      return;
    }
    materialRef.current.uniforms.uResolution.value.set(size.width, size.height);
  }, [size.height, size.width]);

  useFrame((state) => {
    if (!materialRef.current) {
      return;
    }
    const width = state.gl.domElement.width;
    const height = state.gl.domElement.height;
    materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    materialRef.current.uniforms.uResolution.value.set(width, height);
    materialRef.current.uniforms.uMouse.value.set(
      (state.pointer.x * 0.5 + 0.5) * width,
      (state.pointer.y * 0.5 + 0.5) * height
    );
  });

  return (
    <mesh position={[0, 0, -18]} renderOrder={-10}>
      <planeGeometry args={[60, 34]} />
      <primitive object={material} ref={materialRef} attach="material" />
    </mesh>
  );
}

function MinerModel() {
  const { gl } = useThree();
  const groupRef = useRef(null);
  const gltf = useLoader(GLTFLoader, '/3d/miner.glb', (loader) => {
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
      if (!node.isMesh) {
        return;
      }
      node.castShadow = true;
      node.receiveShadow = true;
    });
  }, [model]);

  useFrame((state, delta) => {
    if (!groupRef.current) {
      return;
    }
    groupRef.current.rotation.y += delta * 0.18;
    groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.8) * 0.05;
  });

  return (
    <group ref={groupRef} position={[0, -0.15, 0]} scale={[modelScale, modelScale, modelScale]}>
      <primitive object={model} />
    </group>
  );
}

function MinerModelFallback() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div className="model-loader-card">Loading Miner Model: {Math.round(progress)}%</div>
    </Html>
  );
}

function MinerCameraRig() {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(0, 0.65, 6.8);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  return null;
}

export default function MinerScene() {
  return (
    <group>
      <MinerCameraRig />
      <MinerBackgroundShader />

      <ambientLight intensity={0.4} />
      <hemisphereLight args={['#fff2cc', '#3b2d70', 0.55]} />
      <directionalLight
        castShadow
        position={[4.5, 5.5, 3.5]}
        intensity={1.35}
        color="#fff4cf"
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <pointLight position={[-3.2, 1.3, -2.8]} intensity={1.15} color="#7f5cff" />
      <spotLight position={[0, 3.2, 5]} intensity={1} angle={0.5} penumbra={0.5} color="#fedb48" />

      <Environment preset="sunset" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.15, 0]} receiveShadow>
        <circleGeometry args={[12, 48]} />
        <meshStandardMaterial color="#2f2559" roughness={0.95} metalness={0.1} />
      </mesh>

      <Suspense fallback={<MinerModelFallback />}>
        <MinerModel />
      </Suspense>
    </group>
  );
}
