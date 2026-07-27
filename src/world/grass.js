import {
  InstancedMesh,
  BufferGeometry,
  Float32BufferAttribute,
  MeshStandardMaterial,
  DoubleSide,
  Object3D,
  Color,
  DynamicDrawUsage,
} from 'three';
import { heightAt, slopeAt, WATER_LEVEL } from './terrain.js';
import { applyWind } from './wind.js';
import { settings } from '../core/settings.js';
import { randRange, TAU } from '../utils/math.js';
import { noise } from '../utils/noise.js';

const BLADE_SEGMENTS = 4;
const FIELD_RADIUS = 130;

/** Lâmina afilada, base larga, com curvatura embutida — 4 segmentos bastam para dobrar. */
const createBladeGeometry = (height = 0.42, width = 0.032) => {
  const positions = [];
  const normals = [];
  const uvs = [];
  const colors = [];
  const indices = [];

  const base = new Color('#33521f');
  const tip = new Color('#8fbf52');
  const c = new Color();

  for (let i = 0; i <= BLADE_SEGMENTS; i++) {
    const t = i / BLADE_SEGMENTS;
    const y = t * height;
    const w = width * (1 - t * 0.92);
    const curve = t * t * 0.12;

    positions.push(-w, y, curve, w, y, curve);
    normals.push(0, 0, 1, 0, 0, 1);
    uvs.push(0, t, 1, t);

    c.copy(base).lerp(tip, t * t * 0.85 + t * 0.15);
    colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
  }

  for (let i = 0; i < BLADE_SEGMENTS; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }

  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  return geo;
};

export const createGrass = () => {
  const count = settings.preset.grassCount;
  if (count === 0) return { mesh: null, dispose: () => {} };

  const geometry = createBladeGeometry();
  const material = applyWind(
    new MeshStandardMaterial({
      vertexColors: true,
      side: DoubleSide,
      roughness: 0.92,
      metalness: 0,
    }),
    { strength: 0.34, mask: 'pow(uv.y, 1.8)' },
  );

  const mesh = new InstancedMesh(geometry, material, count);
  mesh.name = 'grass';
  mesh.receiveShadow = true;
  mesh.castShadow = false; // 60k sombras não valem o custo; o AO do terreno cobre
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);

  const dummy = new Object3D();
  const tint = new Color();
  let placed = 0;
  let attempts = 0;

  while (placed < count && attempts < count * 6) {
    attempts++;
    // Distribuição enviesada ao centro: mais densa onde o jogador olha
    const r = Math.sqrt(Math.random()) * FIELD_RADIUS;
    const a = Math.random() * TAU;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r - 10;
    const y = heightAt(x, z);

    if (y < WATER_LEVEL + 0.45) continue;
    if (slopeAt(x, z) > 0.55) continue;
    // Clareiras: buracos orgânicos em vez de tapete uniforme
    if (noise.fbm2D(x * 0.035, z * 0.035, 2) < -0.28) continue;

    dummy.position.set(x, y - 0.03, z);
    dummy.rotation.set(randRange(-0.12, 0.12), Math.random() * TAU, randRange(-0.18, 0.18));
    const scale = randRange(0.75, 1.35);
    dummy.scale.set(randRange(0.85, 1.25), scale, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);

    const v = noise.fbm2D(x * 0.05, z * 0.05, 2) * 0.5 + 0.5;
    tint.setHSL(0.24 + v * 0.05, 0.42 + v * 0.18, 0.34 + v * 0.16);
    mesh.setColorAt(placed, tint);
    placed++;
  }

  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();

  return {
    mesh,
    dispose: () => {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
};
