import {
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  ConeGeometry,
  BoxGeometry,
  CylinderGeometry,
  Color,
  Float32BufferAttribute,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { randRange } from '../../utils/math.js';

/** Paletas por variante — o pato "raro" vale mais pontos e se destaca no céu. */
export const DUCK_VARIANTS = {
  mallard: {
    head: '#1c4f2e',
    collar: '#f2f2f2',
    breast: '#7a4527',
    body: '#8d8d8d',
    belly: '#d8d8d8',
    wing: '#6e6e6e',
    speculum: '#2f5fb0',
    beak: '#e5a93c',
    feet: '#e5773c',
    score: 1,
  },
  black: {
    head: '#2b2b30',
    collar: '#4a4a52',
    breast: '#3a3a40',
    body: '#46464e',
    belly: '#5c5c66',
    wing: '#33333a',
    speculum: '#6a4fb5',
    beak: '#d8c04a',
    feet: '#c9683a',
    score: 1.5,
  },
  golden: {
    head: '#c98a1e',
    collar: '#ffe9a8',
    breast: '#e0a733',
    body: '#f0c451',
    belly: '#fff0c0',
    wing: '#d8a83a',
    speculum: '#ff8c2e',
    beak: '#ff7a1a',
    feet: '#ff9a3c',
    score: 3,
  },
};

const scratch = new Color();

/** Pinta uma geometria com cor por vértice para permitir o merge por parte. */
const paint = (geometry, hex) => {
  scratch.set(hex);
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = scratch.r;
    colors[i * 3 + 1] = scratch.g;
    colors[i * 3 + 2] = scratch.b;
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geometry;
};

const merge = (parts) => {
  const geo = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  geo.computeVertexNormals();
  return geo;
};

/** Tufo de penas: cones achatados espalhados numa faixa — dá silhueta sem custar polígonos. */
const featherTuft = (palette, { count, spread, length, y, z, color }) => {
  const feathers = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const g = new ConeGeometry(0.035, length * randRange(0.82, 1.15), 4, 1);
    g.scale(1, 1, 0.4);
    g.rotateX(Math.PI / 2);
    g.rotateZ(randRange(-0.2, 0.2));
    g.translate((t - 0.5) * spread, y + randRange(-0.012, 0.012), z);
    feathers.push(paint(g, color ?? palette.wing));
  }
  return feathers;
};

const buildBody = (palette) => {
  const parts = [];

  const body = new SphereGeometry(0.3, 14, 10);
  body.scale(1, 0.92, 1.5);
  parts.push(paint(body, palette.body));

  const belly = new SphereGeometry(0.26, 12, 8);
  belly.scale(1, 0.62, 1.35);
  belly.translate(0, -0.09, 0.02);
  parts.push(paint(belly, palette.belly));

  const breast = new SphereGeometry(0.24, 12, 9);
  breast.scale(1, 1, 0.9);
  breast.translate(0, 0.02, 0.3);
  parts.push(paint(breast, palette.breast));

  // Cauda levantada, com penas de leme
  const tail = new ConeGeometry(0.17, 0.42, 6, 1);
  tail.rotateX(-Math.PI / 2);
  tail.rotateX(-0.42);
  tail.translate(0, 0.09, -0.55);
  parts.push(paint(tail, palette.body));
  parts.push(...featherTuft(palette, { count: 5, spread: 0.22, length: 0.2, y: 0.12, z: -0.66 }));

  // Penas das costas
  parts.push(
    ...featherTuft(palette, { count: 7, spread: 0.34, length: 0.16, y: 0.24, z: -0.1, color: palette.wing }),
  );

  const footL = new BoxGeometry(0.09, 0.03, 0.13);
  footL.translate(-0.09, -0.19, 0.02);
  parts.push(paint(footL, palette.feet));
  const footR = footL.clone();
  footR.translate(0.18, 0, 0);
  parts.push(paint(footR, palette.feet));

  return merge(parts);
};

const buildHead = (palette) => {
  const parts = [];

  const neck = new CylinderGeometry(0.085, 0.13, 0.3, 8, 1);
  neck.rotateX(0.32);
  neck.translate(0, 0.13, 0.03);
  parts.push(paint(neck, palette.head));

  const collar = new CylinderGeometry(0.095, 0.095, 0.05, 8, 1);
  collar.rotateX(0.32);
  collar.translate(0, 0.22, 0.075);
  parts.push(paint(collar, palette.collar));

  const head = new SphereGeometry(0.135, 12, 9);
  head.scale(1, 1.05, 1.15);
  head.translate(0, 0.32, 0.1);
  parts.push(paint(head, palette.head));

  const beak = new ConeGeometry(0.075, 0.24, 6, 1);
  beak.rotateX(Math.PI / 2);
  beak.scale(1, 0.5, 1);
  beak.translate(0, 0.29, 0.28);
  parts.push(paint(beak, palette.beak));

  const eyeL = new SphereGeometry(0.032, 7, 6);
  eyeL.translate(-0.09, 0.36, 0.17);
  parts.push(paint(eyeL, '#0d0d10'));
  const eyeR = eyeL.clone();
  eyeR.translate(0.18, 0, 0);
  parts.push(paint(eyeR, '#0d0d10'));

  // Brilho do olho: pequeno, mas é o que dá "vida" ao modelo
  const glintL = new SphereGeometry(0.012, 5, 4);
  glintL.translate(-0.105, 0.375, 0.195);
  parts.push(paint(glintL, '#ffffff'));
  const glintR = glintL.clone();
  glintR.translate(0.21, 0, 0);
  parts.push(paint(glintR, '#ffffff'));

  return merge(parts);
};

/** Asa em dois segmentos: braço (pivô no ombro) e antebraço com penas primárias. */
const buildWing = (palette, side) => {
  const s = side === 'left' ? -1 : 1;

  const upperParts = [];
  const arm = new BoxGeometry(0.34, 0.055, 0.34);
  arm.translate(s * 0.17, 0, -0.02);
  upperParts.push(paint(arm, palette.wing));

  const speculum = new BoxGeometry(0.2, 0.03, 0.12);
  speculum.translate(s * 0.16, 0.04, -0.14);
  upperParts.push(paint(speculum, palette.speculum));

  const covert = new BoxGeometry(0.3, 0.035, 0.16);
  covert.translate(s * 0.15, 0.045, 0.08);
  upperParts.push(paint(covert, palette.body));

  const forearmParts = [];
  const forearm = new BoxGeometry(0.42, 0.045, 0.28);
  forearm.translate(s * 0.21, 0, -0.04);
  forearmParts.push(paint(forearm, palette.wing));

  // Primárias: leque de 6 penas na ponta
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const g = new ConeGeometry(0.038, 0.3 + t * 0.14, 4, 1);
    g.scale(1, 1, 0.35);
    g.rotateX(Math.PI / 2);
    g.rotateY(s * (0.35 + t * 0.5));
    g.translate(s * (0.4 + t * 0.05), 0, -0.12 - t * 0.14);
    forearmParts.push(paint(g, t > 0.6 ? palette.body : palette.wing));
  }

  return { upper: merge(upperParts), forearm: merge(forearmParts) };
};

/**
 * Pato procedural articulado.
 * Retorna o grafo com os pivôs que o `Duck` anima: cabeça (pescoço), duas asas
 * de dois segmentos e o corpo. Se um `.glb` for registrado com a chave `duck`,
 * o AssetManager passa a devolver o modelo autoral no lugar deste.
 */
export const createDuckModel = (variantName = 'mallard') => {
  const palette = DUCK_VARIANTS[variantName] ?? DUCK_VARIANTS.mallard;

  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.72,
    metalness: 0.04,
    flatShading: true,
  });

  const root = new Group();
  root.name = `duck:${variantName}`;

  const body = new Mesh(buildBody(palette), material);
  body.name = 'body';
  const head = new Mesh(buildHead(palette), material);
  head.name = 'head';
  head.position.set(0, 0.06, 0.3);

  const makeWing = (side) => {
    const geo = buildWing(palette, side);
    const shoulder = new Group();
    shoulder.name = `shoulder-${side}`;
    shoulder.position.set(side === 'left' ? -0.16 : 0.16, 0.12, 0.02);

    const upper = new Mesh(geo.upper, material);
    const elbow = new Group();
    elbow.name = `elbow-${side}`;
    elbow.position.set(side === 'left' ? -0.33 : 0.33, 0, 0);
    elbow.add(new Mesh(geo.forearm, material));

    shoulder.add(upper, elbow);
    return { shoulder, elbow };
  };

  const wingLeft = makeWing('left');
  const wingRight = makeWing('right');

  root.add(body, head, wingLeft.shoulder, wingRight.shoulder);
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = false;
    o.frustumCulled = false; // culling é feito pelo container do Duck
  });

  return {
    scene: root,
    animations: [],
    parts: {
      body,
      head,
      wingLeft,
      wingRight,
    },
    palette,
    material,
  };
};

/** Resolve os pivôs animáveis num grafo já clonado (ou vindo de um GLTF). */
export const resolveDuckParts = (scene) => {
  const find = (name) => scene.getObjectByName(name);
  const shoulderLeft = find('shoulder-left');
  const shoulderRight = find('shoulder-right');
  return {
    body: find('body'),
    head: find('head'),
    wingLeft: { shoulder: shoulderLeft, elbow: find('elbow-left') },
    wingRight: { shoulder: shoulderRight, elbow: find('elbow-right') },
  };
};

const templates = new Map();

/**
 * Instancia um pato reaproveitando geometrias e materiais.
 * O template de cada variante é construído uma única vez; os patos do pool são
 * clones do grafo, então 20 patos custam 20 conjuntos de matrizes, não de buffers.
 */
export const instantiateDuckModel = (variantName = 'mallard') => {
  if (!templates.has(variantName)) templates.set(variantName, createDuckModel(variantName));
  const template = templates.get(variantName);
  const scene = template.scene.clone(true);
  return {
    scene,
    animations: [],
    parts: resolveDuckParts(scene),
    palette: template.palette,
    material: template.material,
  };
};

export const disposeDuckTemplates = () => {
  templates.forEach((t) => {
    t.scene.traverse((o) => o.isMesh && o.geometry.dispose());
    t.material.dispose();
  });
  templates.clear();
};
