import {
  InstancedMesh,
  Object3D,
  Color,
  MeshStandardMaterial,
  CylinderGeometry,
  IcosahedronGeometry,
  SphereGeometry,
  PlaneGeometry,
  Group,
  DoubleSide,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { heightAt, slopeAt, WATER_LEVEL, LAKE } from './terrain.js';
import { applyWind } from './wind.js';
import { settings } from '../core/settings.js';
import { randRange, randInt, TAU, pick } from '../utils/math.js';
import { noise } from '../utils/noise.js';

const FOLIAGE_COLORS = ['#3f6b2c', '#4d7a30', '#35602a', '#5c8836', '#2f5526'];
const FLOWER_COLORS = ['#f2d24b', '#e8637a', '#f0f0f0', '#b98ce0', '#f29a3c'];

/** Amostragem por rejeição sobre o terreno, com filtros de encosta/água/lago. */
const scatterPoints = ({
  count,
  radius,
  minRadius = 0,
  maxSlope = 0.5,
  minHeight = WATER_LEVEL + 0.6,
  density,
  centerZ = -10,
}) => {
  const points = [];
  let attempts = 0;
  while (points.length < count && attempts < count * 12) {
    attempts++;
    const r = minRadius + Math.sqrt(Math.random()) * (radius - minRadius);
    const a = Math.random() * TAU;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r + centerZ;
    const y = heightAt(x, z);

    if (y < minHeight) continue;
    if (slopeAt(x, z) > maxSlope) continue;
    if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.radius * 0.95) continue;
    if (density && noise.fbm2D(x * density.freq, z * density.freq, 2) < density.threshold) continue;

    points.push({ x, y, z });
  }
  return points;
};

const buildInstanced = (geometry, material, transforms, { shadows = true } = {}) => {
  const mesh = new InstancedMesh(geometry, material, transforms.length);
  const dummy = new Object3D();
  const color = new Color();

  transforms.forEach((t, i) => {
    dummy.position.set(t.x, t.y, t.z);
    dummy.rotation.set(t.rx ?? 0, t.ry ?? 0, t.rz ?? 0);
    dummy.scale.setScalar(t.scale ?? 1);
    if (t.scaleY) dummy.scale.y *= t.scaleY;
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    if (t.color) mesh.setColorAt(i, color.set(t.color));
  });

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  return mesh;
};

/** Copa low-poly: 3–4 icosaedros deslocados, fundidos numa geometria só. */
const createFoliageGeometry = (detail) => {
  const blobs = [];
  const layers = detail > 0 ? 4 : 2;
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1 || 1);
    const g = new IcosahedronGeometry(1.5 - t * 0.55, detail);
    g.scale(1, 0.82, 1);
    g.translate(
      Math.sin(i * 2.3) * 0.55 * (1 - t),
      2.6 + t * 1.7,
      Math.cos(i * 1.7) * 0.55 * (1 - t),
    );
    blobs.push(g);
  }
  const merged = mergeGeometries(blobs);
  blobs.forEach((g) => g.dispose());
  return merged;
};

const createTrunkGeometry = (segments) => {
  const g = new CylinderGeometry(0.16, 0.34, 3.2, segments, 1);
  g.translate(0, 1.6, 0);
  return g;
};

/** Pedra: icosaedro com vértices deslocados por ruído — nenhuma fica igual à outra. */
const createRockGeometry = () => {
  const g = new IcosahedronGeometry(1, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const d = 1 + noise.noise3D(x * 1.6, y * 1.6, z * 1.6) * 0.32;
    pos.setXYZ(i, x * d, y * d * 0.72, z * d);
  }
  g.computeVertexNormals();
  return g;
};

const createFlowerGeometry = () => {
  const stem = new CylinderGeometry(0.012, 0.018, 0.42, 4, 1);
  stem.translate(0, 0.21, 0);
  const petalA = new PlaneGeometry(0.16, 0.16);
  petalA.translate(0, 0.44, 0);
  const petalB = petalA.clone();
  petalB.rotateY(Math.PI / 2);
  const merged = mergeGeometries([stem, petalA, petalB]);
  [stem, petalA, petalB].forEach((g) => g.dispose());
  return merged;
};

const createBushGeometry = () => {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const g = new SphereGeometry(randRange(0.42, 0.68), 6, 5);
    g.scale(1, 0.78, 1);
    g.translate(randRange(-0.35, 0.35), randRange(0.28, 0.5), randRange(-0.35, 0.35));
    parts.push(g);
  }
  const merged = mergeGeometries(parts);
  parts.forEach((g) => g.dispose());
  return merged;
};

export const createScatter = () => {
  const group = new Group();
  group.name = 'scatter';
  const disposables = [];
  const scale = settings.preset.scatterScale;
  const tier = settings.preset.tier;

  const track = (...items) => {
    disposables.push(...items);
    return items[0];
  };

  // ---------- Árvores (dois buckets de LOD por distância) ----------
  const trunkMaterial = track(
    new MeshStandardMaterial({ color: '#5c4128', roughness: 0.95, flatShading: true }),
  );
  const foliageMaterialNear = track(
    applyWind(
      new MeshStandardMaterial({ roughness: 0.88, flatShading: true, metalness: 0 }),
      { strength: 0.16, mask: 'clamp((transformed.y - 1.8) * 0.22, 0.0, 1.0)' },
    ),
  );
  const foliageMaterialFar = track(
    new MeshStandardMaterial({ roughness: 0.9, flatShading: true, metalness: 0 }),
  );

  const treeSpots = scatterPoints({
    count: Math.round(150 * scale),
    radius: 165,
    minRadius: 44,
    maxSlope: 0.55,
    density: { freq: 0.018, threshold: -0.15 },
  });

  const near = [];
  const far = [];
  treeSpots.forEach((p) => {
    const t = {
      ...p,
      y: p.y - 0.15,
      ry: Math.random() * TAU,
      scale: randRange(0.85, 1.9),
      scaleY: randRange(0.9, 1.35),
      color: pick(FOLIAGE_COLORS),
    };
    (Math.hypot(p.x, p.z + 10) < 95 ? near : far).push(t);
  });

  const trunkNear = track(createTrunkGeometry(tier >= 2 ? 8 : 5));
  const foliageNear = track(createFoliageGeometry(tier >= 2 ? 1 : 0));
  const trunkFar = track(createTrunkGeometry(4));
  const foliageFar = track(createFoliageGeometry(0));

  if (near.length) {
    group.add(buildInstanced(trunkNear, trunkMaterial, near));
    group.add(buildInstanced(foliageNear, foliageMaterialNear, near));
  }
  if (far.length) {
    group.add(buildInstanced(trunkFar, trunkMaterial, far, { shadows: false }));
    group.add(buildInstanced(foliageFar, foliageMaterialFar, far, { shadows: false }));
  }

  // ---------- Arbustos ----------
  const bushGeometry = track(createBushGeometry());
  const bushMaterial = track(
    applyWind(new MeshStandardMaterial({ roughness: 0.9, flatShading: true }), {
      strength: 0.09,
      mask: 'clamp(transformed.y * 0.9, 0.0, 1.0)',
    }),
  );
  const bushes = scatterPoints({
    count: Math.round(220 * scale),
    radius: 130,
    minRadius: 26,
    density: { freq: 0.03, threshold: -0.2 },
  }).map((p) => ({
    ...p,
    ry: Math.random() * TAU,
    scale: randRange(0.7, 1.6),
    color: pick(FOLIAGE_COLORS),
  }));
  if (bushes.length) group.add(buildInstanced(bushGeometry, bushMaterial, bushes));

  // ---------- Pedras ----------
  const rockGeometry = track(createRockGeometry());
  const rockMaterial = track(
    new MeshStandardMaterial({ color: '#8a8781', roughness: 0.85, flatShading: true }),
  );
  const rocks = scatterPoints({
    count: Math.round(130 * scale),
    radius: 150,
    minRadius: 14,
    maxSlope: 0.9,
    minHeight: WATER_LEVEL - 1.2,
  }).map((p) => ({
    ...p,
    y: p.y - randRange(0.1, 0.4),
    rx: randRange(-0.3, 0.3),
    ry: Math.random() * TAU,
    rz: randRange(-0.3, 0.3),
    scale: randRange(0.28, 1.5),
    color: `hsl(${randInt(30, 48)}, ${randInt(4, 12)}%, ${randInt(48, 68)}%)`,
  }));
  if (rocks.length) group.add(buildInstanced(rockGeometry, rockMaterial, rocks));

  // ---------- Flores ----------
  if (tier >= 1) {
    const flowerGeometry = track(createFlowerGeometry());
    const flowerMaterial = track(
      applyWind(
        new MeshStandardMaterial({ roughness: 0.7, side: DoubleSide, flatShading: true }),
        { strength: 0.22, mask: 'clamp(transformed.y * 2.0, 0.0, 1.0)' },
      ),
    );
    const flowers = scatterPoints({
      count: Math.round(900 * scale),
      radius: 90,
      minRadius: 6,
      maxSlope: 0.4,
      density: { freq: 0.06, threshold: 0.05 },
    }).map((p) => ({
      ...p,
      ry: Math.random() * TAU,
      scale: randRange(0.7, 1.5),
      color: pick(FLOWER_COLORS),
    }));
    if (flowers.length) group.add(buildInstanced(flowerGeometry, flowerMaterial, flowers, { shadows: false }));
  }

  return {
    group,
    dispose: () => {
      disposables.forEach((d) => d.dispose?.());
      group.traverse((o) => o.isInstancedMesh && o.dispose());
    },
  };
};
