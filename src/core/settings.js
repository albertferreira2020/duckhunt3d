import { createEmitter } from '../utils/events.js';
import { clamp } from '../utils/math.js';

const STORAGE_KEY = 'duckhunt3d.settings';

/**
 * Presets de qualidade. `tier` é consumido por terreno, grama, scatter e pós-processamento
 * para escolher densidade/resolução sem espalhar `if` pelo código.
 */
export const QUALITY_PRESETS = {
  low: {
    tier: 0,
    label: 'Baixa',
    pixelRatio: 1,
    shadows: false,
    shadowMapSize: 1024,
    bloom: false,
    smaa: false,
    dof: false,
    grassCount: 0,
    scatterScale: 0.4,
    viewDistance: 320,
  },
  medium: {
    tier: 1,
    label: 'Média',
    pixelRatio: 1.25,
    shadows: true,
    shadowMapSize: 1024,
    bloom: true,
    smaa: false,
    dof: false,
    grassCount: 24000,
    scatterScale: 0.7,
    viewDistance: 420,
  },
  high: {
    tier: 2,
    label: 'Alta',
    pixelRatio: 1.5,
    shadows: true,
    shadowMapSize: 2048,
    bloom: true,
    smaa: true,
    dof: true,
    grassCount: 60000,
    scatterScale: 1,
    viewDistance: 520,
  },
  ultra: {
    tier: 3,
    label: 'Ultra',
    pixelRatio: 2,
    shadows: true,
    shadowMapSize: 4096,
    bloom: true,
    smaa: true,
    dof: true,
    grassCount: 110000,
    scatterScale: 1.3,
    viewDistance: 620,
  },
};

const isCoarsePointer = () =>
  typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

const detectQuality = () => {
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = navigator.deviceMemory ?? 4;
  if (isCoarsePointer() || cores <= 4 || mem <= 4) return 'medium';
  return cores >= 10 && mem >= 8 ? 'ultra' : 'high';
};

const DEFAULTS = {
  quality: 'auto',
  masterVolume: 0.8,
  sfxVolume: 1,
  ambienceVolume: 0.55,
  sensitivity: 1,
  invertY: false,
  weather: 'clear',
  debug: false,
};

const load = () => {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') };
  } catch {
    return { ...DEFAULTS };
  }
};

const state = load();
const emitter = createEmitter();

const persist = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* modo privado: apenas ignora */
  }
};

export const settings = {
  on: emitter.on,

  get: (key) => state[key],

  set: (key, value) => {
    if (state[key] === value) return;
    state[key] = value;
    persist();
    emitter.emit('change', { key, value });
    emitter.emit(`change:${key}`, value);
  },

  setNumber: (key, value, min = 0, max = 1) =>
    settings.set(key, clamp(Number(value), min, max)),

  /** Preset efetivo, já resolvendo `auto`. */
  get preset() {
    const name = state.quality === 'auto' ? detectQuality() : state.quality;
    return QUALITY_PRESETS[name] ?? QUALITY_PRESETS.high;
  },

  get all() {
    return { ...state };
  },
};
