import { Raycaster, Vector2, Vector3 } from 'three';
import { TAU } from '../utils/math.js';

const PELLET_SPREAD = 0.022; // em NDC — escala junto com o FOV
const PELLET_RING = 6;

/**
 * Porte do `ShotHandler` original para 3D.
 *
 * Mantém munição, bloqueio de tiro entre rodadas e a detecção de combo (mais de um
 * pato no mesmo disparo). O hit-test em coordenadas de tela virou raycast: a espingarda
 * dispara um feixe central mais um anel de chumbinhos, o que reproduz o multi-acerto
 * do jogo original de forma fisicamente coerente com a arma.
 */
export const createShooting = ({ camera, flock, initialAmmo = 3 }) => {
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const impact = new Vector3();
  const state = { ammo: initialAmmo, initialAmmo, enabled: false };
  const hits = [];

  const castPellet = (x, y) => {
    ndc.set(x, y);
    raycaster.setFromCamera(ndc, camera);
    return flock.raycast(raycaster.ray);
  };

  /**
   * Dispara. Retorna o resultado para quem chamou decidir pontuação, som e partículas —
   * este módulo não conhece HUD nem áudio.
   */
  const fire = (pointer) => {
    if (!state.enabled) return { fired: false, dry: false, hits: [], distance: 0 };
    if (state.ammo <= 0) return { fired: false, dry: true, hits: [], distance: 0 };

    state.ammo--;
    hits.length = 0;

    const center = castPellet(pointer.x, pointer.y);
    if (center) hits.push(center);

    for (let i = 0; i < PELLET_RING; i++) {
      const angle = (i / PELLET_RING) * TAU;
      const duck = castPellet(
        pointer.x + Math.cos(angle) * PELLET_SPREAD,
        pointer.y + Math.sin(angle) * PELLET_SPREAD,
      );
      if (duck && !hits.includes(duck)) hits.push(duck);
    }

    // Ponto de impacto para o foco do DoF e para o rastro de fumaça
    let distance = 90;
    if (hits.length) {
      impact.copy(hits[0].container.position);
      distance = camera.position.distanceTo(impact);
    }

    return { fired: true, dry: false, hits, distance, point: impact };
  };

  return {
    fire,
    get ammo() {
      return state.ammo;
    },
    get enabled() {
      return state.enabled;
    },
    get isEmpty() {
      return state.ammo <= 0;
    },
    setInitialAmmo: (value) => {
      state.initialAmmo = value;
    },
    reset: () => {
      state.ammo = state.initialAmmo;
    },
    enable: () => {
      state.enabled = true;
    },
    disable: () => {
      state.enabled = false;
    },
  };
};
