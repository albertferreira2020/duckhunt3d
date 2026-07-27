import {
  Points,
  BufferGeometry,
  BufferAttribute,
  ShaderMaterial,
  AdditiveBlending,
  NormalBlending,
  InstancedMesh,
  PlaneGeometry,
  MeshStandardMaterial,
  DoubleSide,
  Object3D,
  Color,
  Vector3,
} from 'three';
import { createSoftCircleTexture } from '../world/textures.js';
import { randRange, TAU } from '../utils/math.js';
import { heightAt } from '../world/terrain.js';

const SPRITE_CAPACITY = 1100;
const FEATHER_CAPACITY = 220;

const spriteVertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aLife;
  attribute float aMaxLife;
  attribute vec3  aColor;

  varying float vAlpha;
  varying vec3  vColor;

  void main() {
    float t = 1.0 - clamp(aLife / aMaxLife, 0.0, 1.0);
    vColor = aColor;
    // Cresce e desvanece: curva rápida na entrada, longa na saída
    vAlpha = (1.0 - t) * smoothstep(0.0, 0.12, t);

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (1.0 + t * 1.8) * (320.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const spriteFragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uOpacity;
  varying float vAlpha;
  varying vec3  vColor;

  void main() {
    vec4 tex = texture2D(uMap, gl_PointCoord);
    float alpha = tex.a * vAlpha * uOpacity;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(vColor, alpha);
  }
`;

/** Buffer de partículas com compactação por swap — sem alocação em runtime. */
const createSpriteLayer = ({ blending, opacity, texture }) => {
  const position = new Float32Array(SPRITE_CAPACITY * 3);
  const color = new Float32Array(SPRITE_CAPACITY * 3);
  const size = new Float32Array(SPRITE_CAPACITY);
  const life = new Float32Array(SPRITE_CAPACITY);
  const maxLife = new Float32Array(SPRITE_CAPACITY);
  const velocity = new Float32Array(SPRITE_CAPACITY * 3);
  const drag = new Float32Array(SPRITE_CAPACITY);
  const gravity = new Float32Array(SPRITE_CAPACITY);
  let count = 0;

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setAttribute('aColor', new BufferAttribute(color, 3));
  geometry.setAttribute('aSize', new BufferAttribute(size, 1));
  geometry.setAttribute('aLife', new BufferAttribute(life, 1));
  geometry.setAttribute('aMaxLife', new BufferAttribute(maxLife, 1));
  geometry.setDrawRange(0, 0);
  geometry.boundingSphere = null;

  const material = new ShaderMaterial({
    uniforms: { uMap: { value: texture }, uOpacity: { value: opacity } },
    vertexShader: spriteVertexShader,
    fragmentShader: spriteFragmentShader,
    transparent: true,
    depthWrite: false,
    blending,
  });

  const points = new Points(geometry, material);
  points.frustumCulled = false;

  const swap = (a, b) => {
    for (let k = 0; k < 3; k++) {
      position[a * 3 + k] = position[b * 3 + k];
      color[a * 3 + k] = color[b * 3 + k];
      velocity[a * 3 + k] = velocity[b * 3 + k];
    }
    size[a] = size[b];
    life[a] = life[b];
    maxLife[a] = maxLife[b];
    drag[a] = drag[b];
    gravity[a] = gravity[b];
  };

  const spawn = (p, v, c, s, l, d, g) => {
    if (count >= SPRITE_CAPACITY) return;
    const i = count++;
    position[i * 3] = p.x;
    position[i * 3 + 1] = p.y;
    position[i * 3 + 2] = p.z;
    velocity[i * 3] = v.x;
    velocity[i * 3 + 1] = v.y;
    velocity[i * 3 + 2] = v.z;
    color[i * 3] = c.r;
    color[i * 3 + 1] = c.g;
    color[i * 3 + 2] = c.b;
    size[i] = s;
    life[i] = l;
    maxLife[i] = l;
    drag[i] = d;
    gravity[i] = g;
  };

  const update = (dt) => {
    for (let i = 0; i < count; i++) {
      life[i] -= dt;
      if (life[i] <= 0) {
        swap(i, --count);
        i--;
        continue;
      }
      const damping = Math.exp(-drag[i] * dt);
      velocity[i * 3] *= damping;
      velocity[i * 3 + 1] = velocity[i * 3 + 1] * damping + gravity[i] * dt;
      velocity[i * 3 + 2] *= damping;
      position[i * 3] += velocity[i * 3] * dt;
      position[i * 3 + 1] += velocity[i * 3 + 1] * dt;
      position[i * 3 + 2] += velocity[i * 3 + 2] * dt;
    }

    geometry.setDrawRange(0, count);
    if (count === 0) return;
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.aColor.needsUpdate = true;
    geometry.attributes.aSize.needsUpdate = true;
    geometry.attributes.aLife.needsUpdate = true;
    geometry.attributes.aMaxLife.needsUpdate = true;
  };

  return {
    points,
    spawn,
    update,
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
};

/** Penas e folhas: quads instanciados que planam em vez de cair reto. */
const createFlutterLayer = (color) => {
  const geometry = new PlaneGeometry(0.11, 0.16);
  const material = new MeshStandardMaterial({
    color,
    side: DoubleSide,
    roughness: 0.9,
    transparent: true,
    opacity: 1,
  });
  const mesh = new InstancedMesh(geometry, material, FEATHER_CAPACITY);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.count = 0;

  const items = Array.from({ length: FEATHER_CAPACITY }, () => ({
    position: new Vector3(),
    velocity: new Vector3(),
    spin: new Vector3(),
    rotation: new Vector3(),
    phase: 0,
    life: 0,
    maxLife: 1,
    scale: 1,
    hex: color,
  }));
  const tint = new Color();
  const dummy = new Object3D();
  let count = 0;

  const spawn = (p, v, { life = 2.6, scale = 1, hex } = {}) => {
    if (count >= FEATHER_CAPACITY) return;
    const item = items[count];
    item.position.copy(p);
    item.velocity.copy(v);
    item.spin.set(randRange(-5, 5), randRange(-5, 5), randRange(-5, 5));
    item.rotation.set(randRange(0, TAU), randRange(0, TAU), randRange(0, TAU));
    item.phase = Math.random() * TAU;
    item.life = life;
    item.maxLife = life;
    item.scale = scale;
    item.hex = hex ?? color;
    count++;
  };

  const update = (dt, elapsed) => {
    for (let i = 0; i < count; i++) {
      const item = items[i];
      item.life -= dt;
      if (item.life <= 0) {
        const last = items[--count];
        items[count] = item;
        items[i] = last;
        i--;
        continue;
      }

      // Planeio: arrasto alto + oscilação lateral senoidal
      item.velocity.y = Math.max(item.velocity.y - 3.4 * dt, -1.35);
      item.velocity.x += Math.sin(elapsed * 3 + item.phase) * 1.4 * dt;
      item.velocity.z += Math.cos(elapsed * 2.4 + item.phase) * 1.4 * dt;
      item.velocity.multiplyScalar(Math.exp(-1.9 * dt));
      item.position.addScaledVector(item.velocity, dt);

      const ground = heightAt(item.position.x, item.position.z) + 0.04;
      if (item.position.y < ground) {
        item.position.y = ground;
        item.velocity.set(0, 0, 0);
        item.life = Math.min(item.life, 0.7);
      } else {
        item.rotation.x += item.spin.x * dt;
        item.rotation.y += item.spin.y * dt;
        item.rotation.z += item.spin.z * dt;
      }

      const fade = Math.min(1, item.life / 0.6);
      dummy.position.copy(item.position);
      dummy.rotation.set(item.rotation.x, item.rotation.y, item.rotation.z);
      dummy.scale.setScalar(item.scale * fade);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      // Cor reaplicada por índice: os itens trocam de slot ao morrer
      mesh.setColorAt(i, tint.set(item.hex));
    }

    mesh.count = count;
    if (count > 0) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  };

  return {
    mesh,
    spawn,
    update,
    dispose: () => {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
};

/**
 * Sistema de partículas do jogo: fumaça/poeira (aditiva e normal), faíscas de impacto,
 * penas e folhas. Tudo com capacidade fixa e reaproveitamento por índice.
 */
export const createParticles = (scene) => {
  const texture = createSoftCircleTexture(64);
  const smoke = createSpriteLayer({ blending: NormalBlending, opacity: 0.55, texture });
  const sparks = createSpriteLayer({ blending: AdditiveBlending, opacity: 1, texture });
  const feathers = createFlutterLayer('#ffffff');
  const leaves = createFlutterLayer('#5c8836');

  scene.add(smoke.points, sparks.points, feathers.mesh, leaves.mesh);

  // Vetores de rascunho reutilizados: emitir partícula não deve gerar lixo
  const p = new Vector3();
  const v = new Vector3();
  const jitter = new Vector3();
  const c = new Color();

  const scatter = (a, b) => jitter.set(randRange(-a, a), randRange(-b, b), randRange(-a, a));

  const emitMuzzle = (position, direction) => {
    for (let i = 0; i < 14; i++) {
      p.copy(position).addScaledVector(direction, randRange(0, 0.3));
      v.copy(direction).multiplyScalar(randRange(3, 9)).add(scatter(1.4, 1.2));
      c.setHSL(0.08, 0.05, randRange(0.55, 0.85));
      smoke.spawn(p, v, c, randRange(9, 22), randRange(0.4, 0.9), 3.2, 1.4);
    }
    for (let i = 0; i < 10; i++) {
      p.copy(position);
      v.copy(direction).multiplyScalar(randRange(6, 18)).add(scatter(3, 3));
      c.setHSL(randRange(0.06, 0.11), 1, randRange(0.6, 0.78));
      sparks.spawn(p, v, c, randRange(3, 8), randRange(0.08, 0.2), 6, -9);
    }
  };

  const emitFeathers = (position, { count = 16, hex = '#f0f0f0' } = {}) => {
    for (let i = 0; i < count; i++) {
      p.copy(position).add(scatter(0.2, 0.2));
      v.set(randRange(-3.5, 3.5), randRange(0.5, 4.5), randRange(-3.5, 3.5));
      feathers.spawn(p, v, { hex, scale: randRange(0.7, 1.4), life: randRange(2.2, 3.6) });
    }
    for (let i = 0; i < 8; i++) {
      p.copy(position);
      v.set(randRange(-4, 4), randRange(-1, 4), randRange(-4, 4));
      c.setHSL(0, 0, randRange(0.75, 1));
      smoke.spawn(p, v, c, randRange(5, 12), randRange(0.25, 0.5), 4, -1.5);
    }
  };

  const emitImpact = (position) => {
    for (let i = 0; i < 18; i++) {
      p.copy(position);
      v.set(randRange(-3, 3), randRange(1, 5), randRange(-3, 3));
      c.setHSL(randRange(0.07, 0.12), 0.35, randRange(0.35, 0.6));
      smoke.spawn(p, v, c, randRange(8, 20), randRange(0.5, 1.2), 2.4, -2.2);
    }
  };

  const emitDust = (position, amount = 10) => {
    for (let i = 0; i < amount; i++) {
      p.copy(position).add(scatter(0.4, 0));
      v.set(randRange(-1.2, 1.2), randRange(0.4, 1.6), randRange(-1.2, 1.2));
      c.setHSL(0.1, 0.18, randRange(0.55, 0.75));
      smoke.spawn(p, v, c, randRange(12, 26), randRange(0.8, 1.6), 1.8, -0.4);
    }
  };

  const emitLeaves = (position, amount = 6) => {
    for (let i = 0; i < amount; i++) {
      p.copy(position).add(scatter(1, 0.75));
      v.set(randRange(-1.5, 1.5), randRange(-0.4, 0.8), randRange(-1.5, 1.5));
      leaves.spawn(p, v, { life: randRange(3.5, 6), scale: randRange(0.8, 1.5) });
    }
  };

  return {
    emitMuzzle,
    emitFeathers,
    emitImpact,
    emitDust,
    emitLeaves,
    update: (dt, elapsed) => {
      smoke.update(dt);
      sparks.update(dt);
      feathers.update(dt, elapsed);
      leaves.update(dt, elapsed);
    },
    dispose: () => {
      [smoke, sparks, feathers, leaves].forEach((l) => l.dispose());
      texture.dispose();
    },
  };
};
