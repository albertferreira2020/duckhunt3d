import {
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  BoxGeometry,
  CylinderGeometry,
  ConeGeometry,
  Color,
  Float32BufferAttribute,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const PALETTE = {
  fur: '#b5773f',
  furDark: '#8a5629',
  belly: '#e8d6b8',
  nose: '#2a2320',
  tongue: '#d8566a',
  eye: '#1a1418',
};

const scratch = new Color();

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

const buildTorso = () => {
  const parts = [];

  const chest = new SphereGeometry(0.34, 12, 9);
  chest.scale(1, 0.95, 1.5);
  chest.translate(0, 0, 0.1);
  parts.push(paint(chest, PALETTE.fur));

  const hind = new SphereGeometry(0.32, 12, 9);
  hind.scale(1, 1, 1.1);
  hind.translate(0, 0.02, -0.42);
  parts.push(paint(hind, PALETTE.fur));

  const belly = new SphereGeometry(0.27, 10, 8);
  belly.scale(1, 0.6, 1.7);
  belly.translate(0, -0.14, -0.1);
  parts.push(paint(belly, PALETTE.belly));

  const saddle = new SphereGeometry(0.3, 10, 8);
  saddle.scale(1, 0.5, 1.2);
  saddle.translate(0, 0.19, -0.1);
  parts.push(paint(saddle, PALETTE.furDark));

  return merge(parts);
};

const buildHead = () => {
  const parts = [];

  const skull = new SphereGeometry(0.24, 12, 9);
  skull.scale(1, 0.95, 1.05);
  parts.push(paint(skull, PALETTE.fur));

  const snout = new BoxGeometry(0.19, 0.15, 0.3);
  snout.translate(0, -0.06, 0.28);
  parts.push(paint(snout, PALETTE.belly));

  const nose = new SphereGeometry(0.055, 8, 6);
  nose.scale(1.2, 0.9, 1);
  nose.translate(0, -0.03, 0.44);
  parts.push(paint(nose, PALETTE.nose));

  const eyeL = new SphereGeometry(0.038, 7, 6);
  eyeL.translate(-0.11, 0.06, 0.19);
  parts.push(paint(eyeL, PALETTE.eye));
  const eyeR = eyeL.clone();
  eyeR.translate(0.22, 0, 0);
  parts.push(paint(eyeR, PALETTE.eye));

  const browL = new BoxGeometry(0.1, 0.03, 0.06);
  browL.rotateZ(0.25);
  browL.translate(-0.11, 0.13, 0.2);
  parts.push(paint(browL, PALETTE.furDark));
  const browR = browL.clone();
  browR.rotateZ(-0.5);
  browR.translate(0.22, 0, 0);
  parts.push(paint(browR, PALETTE.furDark));

  return merge(parts);
};

const buildEar = (side) => {
  const g = new SphereGeometry(0.11, 8, 6);
  g.scale(0.5, 1.5, 0.9);
  g.translate(side * 0.2, -0.08, 0.02);
  return paint(g, PALETTE.furDark);
};

const buildLegSegment = (radiusTop, radiusBottom, length, color) => {
  const g = new CylinderGeometry(radiusTop, radiusBottom, length, 6, 1);
  g.translate(0, -length / 2, 0);
  return paint(g, color);
};

const buildPaw = () => {
  const g = new SphereGeometry(0.075, 7, 5);
  g.scale(1, 0.7, 1.4);
  g.translate(0, -0.03, 0.03);
  return paint(g, PALETTE.belly);
};

const buildTail = () => {
  const g = new ConeGeometry(0.07, 0.46, 6, 1);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, -0.23);
  return paint(g, PALETTE.furDark);
};

const buildJaw = () => {
  const parts = [];
  const jaw = new BoxGeometry(0.17, 0.06, 0.26);
  jaw.translate(0, -0.03, 0.15);
  parts.push(paint(jaw, PALETTE.belly));
  const tongue = new BoxGeometry(0.09, 0.02, 0.18);
  tongue.translate(0, 0.02, 0.22);
  parts.push(paint(tongue, PALETTE.tongue));
  return merge(parts);
};

/**
 * Cão procedural com esqueleto articulado por Groups: quatro patas de dois segmentos,
 * cabeça, mandíbula, orelhas e cauda. Os pivôs são o que o `dog.js` anima — mesma
 * interface que um GLTF com bones teria, então trocar por um modelo autoral não
 * muda nada acima.
 */
export const createDogModel = () => {
  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0,
    flatShading: true,
  });

  const root = new Group();
  root.name = 'dog';

  const torso = new Mesh(buildTorso(), material);
  torso.name = 'torso';

  const neck = new Group();
  neck.name = 'neck';
  neck.position.set(0, 0.16, 0.4);

  const head = new Mesh(buildHead(), material);
  head.name = 'head';
  neck.add(head);

  const jaw = new Mesh(buildJaw(), material);
  jaw.name = 'jaw';
  jaw.position.set(0, -0.06, 0.1);
  head.add(jaw);

  const earLeft = new Mesh(buildEar(-1), material);
  const earRight = new Mesh(buildEar(1), material);
  earLeft.name = 'ear-left';
  earRight.name = 'ear-right';
  head.add(earLeft, earRight);

  /** Ponto onde o pato abatido é preso na boca. */
  const mouthAnchor = new Group();
  mouthAnchor.name = 'mouth';
  mouthAnchor.position.set(0, -0.05, 0.42);
  head.add(mouthAnchor);

  const legs = ['fl', 'fr', 'bl', 'br'].map((key) => {
    const front = key[0] === 'f';
    const left = key[1] === 'l';

    const hip = new Group();
    hip.name = `hip-${key}`;
    hip.position.set(left ? -0.19 : 0.19, -0.08, front ? 0.28 : -0.36);
    hip.add(new Mesh(buildLegSegment(0.075, 0.06, 0.26, PALETTE.fur), material));

    const knee = new Group();
    knee.name = `knee-${key}`;
    knee.position.set(0, -0.26, 0);
    knee.add(new Mesh(buildLegSegment(0.055, 0.05, 0.22, PALETTE.fur), material));

    const paw = new Mesh(buildPaw(), material);
    paw.position.set(0, -0.22, 0);
    knee.add(paw);

    hip.add(knee);
    return { key, front, left, hip, knee };
  });

  const tail = new Group();
  tail.name = 'tail';
  tail.position.set(0, 0.16, -0.62);
  tail.rotation.x = -0.7;
  tail.add(new Mesh(buildTail(), material));

  root.add(torso, neck, tail, ...legs.map((l) => l.hip));
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
  });

  return {
    scene: root,
    animations: [],
    parts: { torso, neck, head, jaw, earLeft, earRight, tail, legs, mouthAnchor },
    material,
  };
};
