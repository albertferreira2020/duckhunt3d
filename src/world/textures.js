import { DataTexture, RGBAFormat, RepeatWrapping, LinearMipmapLinearFilter, LinearFilter } from 'three';
import { createNoise } from '../utils/noise.js';

/**
 * Texturas PBR geradas em runtime (normal / roughness / AO).
 * Substituem mapas autorais sem nenhum download; a assinatura é a mesma de um
 * `TextureLoader.load`, então trocar por arquivos depois é uma linha.
 */

const finish = (tex, repeat) => {
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
};

/** Height field tileável por espelhamento — evita costura visível no tiling. */
const buildHeightField = (size, frequency, octaves, seed) => {
  const gen = createNoise(seed);
  const field = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * frequency;
      const v = (y / size) * frequency;
      // Tiling por mistura das 4 cópias deslocadas
      const a = gen.fbm2D(u, v, octaves);
      const b = gen.fbm2D(u - frequency, v, octaves);
      const c = gen.fbm2D(u, v - frequency, octaves);
      const d = gen.fbm2D(u - frequency, v - frequency, octaves);
      const fx = x / size;
      const fy = y / size;
      field[y * size + x] =
        a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
    }
  }
  return field;
};

export const createNormalTexture = ({
  size = 256,
  frequency = 6,
  octaves = 4,
  strength = 1.6,
  repeat = 1,
  seed = 7,
} = {}) => {
  const field = buildHeightField(size, frequency, octaves, seed);
  const data = new Uint8Array(size * size * 4);

  const sample = (x, y) => field[((y + size) % size) * size + ((x + size) % size)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (sample(x + 1, y) - sample(x - 1, y)) * strength;
      const dy = (sample(x, y + 1) - sample(x, y - 1)) * strength;
      // Normal de Sobel simplificado, normalizada e reempacotada em [0,1]
      const len = Math.hypot(-dx, -dy, 1);
      const i = (y * size + x) * 4;
      data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      data[i + 2] = (1 / len) * 0.5 * 255 + 127;
      data[i + 3] = 255;
    }
  }

  return finish(new DataTexture(data, size, size, RGBAFormat), repeat);
};

/** Mapa grayscale reutilizável como roughness, AO ou máscara. */
export const createGrayscaleTexture = ({
  size = 256,
  frequency = 5,
  octaves = 4,
  min = 0.35,
  max = 1,
  repeat = 1,
  seed = 11,
} = {}) => {
  const field = buildHeightField(size, frequency, octaves, seed);
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < field.length; i++) {
    const v = Math.round((min + (field[i] * 0.5 + 0.5) * (max - min)) * 255);
    const o = i * 4;
    data[o] = data[o + 1] = data[o + 2] = v;
    data[o + 3] = 255;
  }
  return finish(new DataTexture(data, size, size, RGBAFormat), repeat);
};

/** Sprite radial suave — base de fumaça, poeira e respingo. */
export const createSoftCircleTexture = (size = 64) => {
  const data = new Uint8Array(size * size * 4);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c) / c;
      const a = Math.max(0, 1 - d);
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(a * a * 255);
    }
  }
  const tex = new DataTexture(data, size, size, RGBAFormat);
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
};
