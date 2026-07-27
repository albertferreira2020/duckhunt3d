import { InstancedMesh, BoxGeometry, MeshStandardMaterial, Object3D, Group, Color } from 'three';
import { heightAt } from './terrain.js';
import { randRange } from '../utils/math.js';
import { createNormalTexture } from './textures.js';

const POST_SPACING = 2.6;

/** Trecho de cerca acompanhando o relevo entre dois pontos. */
const buildSegment = (from, to, posts, rails) => {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  const steps = Math.max(2, Math.round(length / POST_SPACING));
  const angle = Math.atan2(dx, dz);

  let previous = null;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = from.x + dx * t;
    const z = from.z + dz * t;
    const y = heightAt(x, z);
    const post = { x, y, z, angle };
    posts.push(post);

    if (previous) {
      const midX = (previous.x + x) / 2;
      const midZ = (previous.z + z) / 2;
      const midY = (previous.y + y) / 2;
      const span = Math.hypot(x - previous.x, z - previous.z);
      const tilt = Math.atan2(y - previous.y, span);
      rails.push({ x: midX, y: midY + 0.95, z: midZ, angle, tilt, span });
      rails.push({ x: midX, y: midY + 0.48, z: midZ, angle, tilt, span });
    }
    previous = post;
  }
};

export const createFence = () => {
  const posts = [];
  const rails = [];

  // Cerca em "U" aberto, emoldurando o campo de tiro sem tapar a visão
  const path = [
    { x: -46, z: 16 },
    { x: -30, z: 12 },
    { x: 0, z: 11 },
    { x: 30, z: 12 },
    { x: 46, z: 16 },
  ];
  for (let i = 0; i < path.length - 1; i++) buildSegment(path[i], path[i + 1], posts, rails);
  buildSegment({ x: -46, z: 16 }, { x: -58, z: -6 }, posts, rails);
  buildSegment({ x: 46, z: 16 }, { x: 58, z: -6 }, posts, rails);

  const normalMap = createNormalTexture({
    size: 128,
    frequency: 14,
    strength: 2.4,
    repeat: 3,
    seed: 55,
  });
  const material = new MeshStandardMaterial({
    color: new Color('#8a6a45'),
    roughness: 0.95,
    metalness: 0,
    normalMap,
    flatShading: true,
  });

  const postGeometry = new BoxGeometry(0.16, 1.5, 0.16);
  const railGeometry = new BoxGeometry(0.09, 0.14, 1);

  const postMesh = new InstancedMesh(postGeometry, material, posts.length);
  const railMesh = new InstancedMesh(railGeometry, material, rails.length);
  const dummy = new Object3D();
  const tint = new Color();

  posts.forEach((p, i) => {
    dummy.position.set(p.x, p.y + 0.7, p.z);
    dummy.rotation.set(randRange(-0.04, 0.04), p.angle, randRange(-0.05, 0.05));
    dummy.scale.set(1, randRange(0.9, 1.12), 1);
    dummy.updateMatrix();
    postMesh.setMatrixAt(i, dummy.matrix);
    postMesh.setColorAt(i, tint.setHSL(0.08, 0.32, randRange(0.3, 0.46)));
  });

  rails.forEach((r, i) => {
    dummy.position.set(r.x, r.y, r.z);
    dummy.rotation.set(r.tilt, r.angle, 0);
    dummy.scale.set(1, 1, r.span * 1.02);
    dummy.updateMatrix();
    railMesh.setMatrixAt(i, dummy.matrix);
    railMesh.setColorAt(i, tint.setHSL(0.08, 0.3, randRange(0.32, 0.48)));
  });

  [postMesh, railMesh].forEach((m) => {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.castShadow = true;
    m.receiveShadow = true;
    m.computeBoundingSphere();
  });

  const group = new Group();
  group.name = 'fence';
  group.add(postMesh, railMesh);

  return {
    group,
    dispose: () => {
      postGeometry.dispose();
      railGeometry.dispose();
      material.dispose();
      normalMap.dispose();
      postMesh.dispose();
      railMesh.dispose();
    },
  };
};
