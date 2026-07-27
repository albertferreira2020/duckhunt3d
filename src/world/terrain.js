import { Mesh, PlaneGeometry, MeshStandardMaterial, Color, BufferAttribute } from 'three';
import { noise } from '../utils/noise.js';
import { clamp, lerp, smoothstep } from '../utils/math.js';
import { createNormalTexture, createGrayscaleTexture } from './textures.js';
import { settings } from '../core/settings.js';

export const TERRAIN_SIZE = 360;
export const LAKE = { x: -54, z: -48, radius: 26 };
export const WATER_LEVEL = -2.2;
/** Retângulo jogável — onde o cão anda e os patos decolam. */
export const PLAY_AREA = { minX: -34, maxX: 34, minZ: -30, maxZ: 14 };

const GRASS_A = new Color('#4f7a33');
const GRASS_B = new Color('#6f9a3f');
const GRASS_DRY = new Color('#93a95a');
const DIRT = new Color('#6b5236');
const SAND = new Color('#a99269');
const ROCK = new Color('#7b7b74');

/** Altura do terreno em qualquer (x, z). Fonte única — grama, props e cão usam isto. */
export const heightAt = (x, z) => {
  const base = noise.fbm2D(x * 0.011, z * 0.011, 4) * 4.4;
  const detail = noise.fbm2D(x * 0.058, z * 0.058, 3) * 0.8;
  const ridge = Math.max(0, -z - 78) * 0.22; // encosta que sobe rumo às montanhas

  // Achata a arena central para o gameplay ficar legível
  const playMask = smoothstep(clamp((Math.hypot(x, z + 4) - 22) / 48, 0, 1));
  let h = (base + detail) * lerp(0.16, 1, playMask) + ridge;

  // Bacia do lago
  const d = Math.hypot(x - LAKE.x, z - LAKE.z);
  const basin = 1 - smoothstep(clamp((d - LAKE.radius * 0.3) / (LAKE.radius * 0.8), 0, 1));
  h -= basin * 7.6;

  return h;
};

/** Inclinação normalizada (0 = plano, 1 = parede). Usado para espalhar props. */
export const slopeAt = (x, z, step = 1.2) => {
  const dx = heightAt(x + step, z) - heightAt(x - step, z);
  const dz = heightAt(x, z + step) - heightAt(x, z - step);
  return clamp(Math.hypot(dx, dz) / (step * 2), 0, 1);
};

export const createTerrain = () => {
  const segments = settings.preset.tier >= 2 ? 220 : 140;
  const geometry = new PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const color = new Color();

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const y = heightAt(x, z);
    position.setY(i, y);

    const slope = slopeAt(x, z);
    const variation = noise.fbm2D(x * 0.09, z * 0.09, 3) * 0.5 + 0.5;

    color.copy(GRASS_A).lerp(GRASS_B, variation);
    color.lerp(GRASS_DRY, clamp(noise.fbm2D(x * 0.02 + 40, z * 0.02, 2), 0, 1) * 0.45);
    color.lerp(DIRT, smoothstep(clamp((slope - 0.35) / 0.4, 0, 1)));
    color.lerp(ROCK, smoothstep(clamp((slope - 0.7) / 0.3, 0, 1)) * 0.8);
    color.lerp(SAND, 1 - smoothstep(clamp((y - WATER_LEVEL) / 1.6, 0, 1)));

    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const normalMap = createNormalTexture({ size: 256, frequency: 8, strength: 2.2, repeat: 64 });
  const roughnessMap = createGrayscaleTexture({ frequency: 4, min: 0.72, max: 1, repeat: 32 });
  const aoMap = createGrayscaleTexture({ frequency: 3, min: 0.6, max: 1, repeat: 24, seed: 23 });
  geometry.setAttribute('uv1', geometry.attributes.uv);

  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    normalMap,
    roughnessMap,
    aoMap,
    aoMapIntensity: 0.7,
    dithering: true,
  });
  material.normalScale.set(0.55, 0.55);

  const mesh = new Mesh(geometry, material);
  mesh.name = 'terrain';
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();

  return {
    mesh,
    dispose: () => {
      geometry.dispose();
      material.dispose();
      normalMap.dispose();
      roughnessMap.dispose();
      aoMap.dispose();
    },
  };
};
