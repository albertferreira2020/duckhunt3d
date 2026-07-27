import { Mesh, CircleGeometry, MeshStandardMaterial, Color } from 'three';
import { LAKE, WATER_LEVEL } from './terrain.js';
import { createNormalTexture } from './textures.js';

/**
 * Lago. MeshStandardMaterial com normal map procedural rolando em duas velocidades:
 * como o `scene.environment` vem do céu via PMREM, o reflexo acompanha o clima de graça.
 */
export const createWater = () => {
  const normalMap = createNormalTexture({
    size: 256,
    frequency: 5,
    octaves: 3,
    strength: 1.1,
    repeat: 12,
    seed: 91,
  });

  const material = new MeshStandardMaterial({
    color: new Color('#1f4d63'),
    roughness: 0.06,
    metalness: 0.35,
    normalMap,
    envMapIntensity: 1.6,
    transparent: true,
    opacity: 0.9,
  });
  material.normalScale.set(0.32, 0.32);

  const geometry = new CircleGeometry(LAKE.radius * 1.08, 64);
  geometry.rotateX(-Math.PI / 2);

  const mesh = new Mesh(geometry, material);
  mesh.name = 'water';
  mesh.position.set(LAKE.x, WATER_LEVEL, LAKE.z);
  mesh.receiveShadow = true;

  return {
    mesh,
    material,
    update: (elapsed) => {
      normalMap.offset.set(elapsed * 0.012, elapsed * 0.008);
      material.normalScale.setScalar(0.28 + Math.sin(elapsed * 0.6) * 0.06);
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
      normalMap.dispose();
    },
  };
};
