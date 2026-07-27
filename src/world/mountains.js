import { Mesh, ConeGeometry, MeshStandardMaterial, Color, BufferAttribute } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { randRange, TAU } from '../utils/math.js';
import { noise } from '../utils/noise.js';

const RINGS = [
  { radius: 430, count: 26, height: [48, 96], base: [55, 105], color: '#5d7590' },
  { radius: 540, count: 22, height: [72, 140], base: [70, 140], color: '#6b829c' },
];

/**
 * Silhueta de montanhas: dois anéis de cones low-poly bem além do terreno.
 * Ficam fora do alcance de sombra e de colisão — são pura profundidade atmosférica,
 * e o FogExp2 faz o resto do trabalho de perspectiva aérea.
 */
export const createMountains = () => {
  const parts = [];
  const colors = [];

  RINGS.forEach((ring, ringIndex) => {
    for (let i = 0; i < ring.count; i++) {
      const angle = (i / ring.count) * TAU + randRange(-0.06, 0.06);
      const n = noise.noise2D(Math.cos(angle) * 2 + ringIndex * 9, Math.sin(angle) * 2);
      const height = randRange(...ring.height) * (0.75 + n * 0.35);
      const base = randRange(...ring.base);
      const radius = ring.radius + randRange(-45, 45);

      const g = new ConeGeometry(base, height, randRange(5, 8) | 0, 1);
      g.translate(0, height / 2 - 12, 0);
      g.rotateY(randRange(0, TAU));
      g.scale(1, 1, randRange(0.7, 1.25));
      g.translate(Math.cos(angle) * radius, 0, Math.sin(angle) * radius - 20);

      parts.push(g);
      colors.push(new Color(ring.color).offsetHSL(0, randRange(-0.03, 0.03), randRange(-0.06, 0.08)));
    }
  });

  // Cor por vértice varia o tom dos picos sem custar drawcall extra
  const vertexCounts = parts.map((p) => p.attributes.position.count);
  const geometry = mergeGeometries(parts);
  const colorArray = new Float32Array(geometry.attributes.position.count * 3);

  let offset = 0;
  vertexCounts.forEach((verts, i) => {
    const c = colors[i];
    for (let v = 0; v < verts; v++) {
      const o = (offset + v) * 3;
      colorArray[o] = c.r;
      colorArray[o + 1] = c.g;
      colorArray[o + 2] = c.b;
    }
    offset += verts;
  });
  geometry.setAttribute('color', new BufferAttribute(colorArray, 3));
  parts.forEach((p) => p.dispose());

  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    flatShading: true,
    fog: true,
  });

  const mesh = new Mesh(geometry, material);
  mesh.name = 'mountains';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();

  return {
    mesh,
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
};
