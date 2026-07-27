import {
  LineSegments,
  BufferGeometry,
  Float32BufferAttribute,
  ShaderMaterial,
  AdditiveBlending,
  Vector3,
} from 'three';
import { randRange } from '../utils/math.js';

const AREA = 130;
const HEIGHT = 62;

/**
 * Chuva em LineSegments: cada gota é um segmento cuja queda e o wrap-around
 * acontecem inteiramente no vertex shader. Custo de CPU por frame: dois uniforms.
 */
export const createRain = ({ count = 3200 } = {}) => {
  const positions = new Float32Array(count * 2 * 3);
  const offsets = new Float32Array(count * 2);
  const speeds = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    const x = randRange(-AREA / 2, AREA / 2);
    const y = randRange(0, HEIGHT);
    const z = randRange(-AREA / 2, AREA / 2);
    const speed = randRange(26, 42);

    for (let v = 0; v < 2; v++) {
      const idx = i * 2 + v;
      positions[idx * 3] = x;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = z;
      offsets[idx] = v;
      speeds[idx] = speed;
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aOffset', new Float32BufferAttribute(offsets, 1));
  geometry.setAttribute('aSpeed', new Float32BufferAttribute(speeds, 1));
  geometry.boundingSphere = null;

  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uCamera: { value: new Vector3() },
      uArea: { value: AREA },
      uHeight: { value: HEIGHT },
      uStreak: { value: 1.15 },
      uOpacity: { value: 0.32 },
      uWind: { value: 0.22 },
    },
    vertexShader: /* glsl */ `
      attribute float aOffset;
      attribute float aSpeed;

      uniform float uTime;
      uniform vec3  uCamera;
      uniform float uArea;
      uniform float uHeight;
      uniform float uStreak;
      uniform float uWind;

      varying float vFade;

      void main() {
        float fall = mod(position.y - uTime * aSpeed, uHeight);
        vec3 p = vec3(position.x, fall, position.z);

        // Rastro: o segundo vértice fica acima e atrás, na direção do vento
        p.y += aOffset * uStreak * (aSpeed / 34.0);
        p.x -= aOffset * uWind * uStreak;

        // Wrap-around centrado na câmera — a chuva nunca "acaba"
        p.x = mod(p.x - uCamera.x + uArea * 0.5, uArea) - uArea * 0.5 + uCamera.x;
        p.z = mod(p.z - uCamera.z + uArea * 0.5, uArea) - uArea * 0.5 + uCamera.z;
        p.y -= 6.0;

        vFade = smoothstep(0.0, 8.0, fall) * (1.0 - smoothstep(uHeight - 12.0, uHeight, fall));

        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying float vFade;
      void main() {
        gl_FragColor = vec4(0.78, 0.85, 0.95, vFade * uOpacity);
      }
    `,
  });

  const mesh = new LineSegments(geometry, material);
  mesh.name = 'rain';
  mesh.frustumCulled = false;
  mesh.visible = false;

  return {
    mesh,
    setIntensity: (value) => {
      mesh.visible = value > 0;
      material.uniforms.uOpacity.value = 0.32 * value;
    },
    update: (elapsed, camera) => {
      if (!mesh.visible) return;
      material.uniforms.uTime.value = elapsed;
      material.uniforms.uCamera.value.copy(camera.position);
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
};
