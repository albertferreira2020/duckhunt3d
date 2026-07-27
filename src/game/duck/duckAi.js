import { Vector3 } from 'three';
import { cubicBezierVec, randRange, clamp, lerp } from '../../utils/math.js';
import { noise } from '../../utils/noise.js';

/** Volume de voo. O pato nunca sai daqui — as bordas empurram de volta ao centro. */
export const FLIGHT_BOUNDS = {
  minX: -38,
  maxX: 38,
  minY: 7,
  maxY: 32,
  minZ: -52,
  maxZ: -6,
};

const center = new Vector3(
  (FLIGHT_BOUNDS.minX + FLIGHT_BOUNDS.maxX) / 2,
  (FLIGHT_BOUNDS.minY + FLIGHT_BOUNDS.maxY) / 2,
  (FLIGHT_BOUNDS.minZ + FLIGHT_BOUNDS.maxZ) / 2,
);

const inside = (v) =>
  v.x > FLIGHT_BOUNDS.minX &&
  v.x < FLIGHT_BOUNDS.maxX &&
  v.y > FLIGHT_BOUNDS.minY &&
  v.y < FLIGHT_BOUNDS.maxY &&
  v.z > FLIGHT_BOUNDS.minZ &&
  v.z < FLIGHT_BOUNDS.maxZ;

/**
 * Cérebro de voo do pato.
 *
 * Nunca há linha reta: cada trecho é uma Bézier cúbica cujo primeiro ponto de controle
 * herda a velocidade atual (continuidade C1, sem "cotovelo" na virada) e cujo destino é
 * sorteado com viés para longe da borda. Por cima disso corre um deslocamento de Perlin
 * que dá a trepidação de asa batendo. O resultado é imprevisível sem nunca ser errático.
 */
export const createDuckBrain = (seed = Math.random() * 1000) => {
  const p0 = new Vector3();
  const p1 = new Vector3();
  const p2 = new Vector3();
  const p3 = new Vector3();
  const position = new Vector3();
  const previous = new Vector3();
  const velocity = new Vector3();
  const tangent = new Vector3();
  const tmp = new Vector3();
  const wobble = new Vector3();

  const state = {
    t: 1,
    duration: 1,
    segment: 0,
    noiseAmplitude: 0.9,
    noiseSpeed: 0.9,
    seed,
  };

  /** Sorteia destino: prefere o hemisfério oposto ao atual e evita as bordas. */
  const pickTarget = (out, difficulty) => {
    const spread = lerp(0.55, 1, difficulty);
    for (let attempt = 0; attempt < 8; attempt++) {
      out.set(
        randRange(FLIGHT_BOUNDS.minX, FLIGHT_BOUNDS.maxX) * spread,
        randRange(FLIGHT_BOUNDS.minY + 2, FLIGHT_BOUNDS.maxY - 2),
        randRange(FLIGHT_BOUNDS.minZ, FLIGHT_BOUNDS.maxZ),
      );
      // Rejeita destinos colados no ponto atual — vira sempre precisa ser visível
      if (out.distanceToSquared(position) > 100 && inside(out)) return out;
    }
    return out.copy(center);
  };

  /** Novo trecho de Bézier partindo da posição e velocidade atuais. */
  const retarget = (difficulty, { escape = false } = {}) => {
    p0.copy(position);

    if (escape) {
      p3.set(position.x * 1.25, FLIGHT_BOUNDS.maxY + 26, position.z - 22);
    } else {
      pickTarget(p3, difficulty);
    }

    const distance = p0.distanceTo(p3);
    const handle = distance * randRange(0.32, 0.55);

    // C1: sai na direção em que já estava indo
    if (velocity.lengthSq() > 0.001) {
      tmp.copy(velocity).normalize().multiplyScalar(handle);
    } else {
      tmp.subVectors(p3, p0).normalize().multiplyScalar(handle);
    }
    p1.copy(p0).add(tmp);

    // Chegada por um arco lateral, com viés vertical aleatório (subida/descida)
    tmp.subVectors(p3, p0).normalize().multiplyScalar(-handle);
    tmp.x += randRange(-1, 1) * distance * 0.28;
    tmp.y += randRange(-1, 1) * distance * 0.22;
    p2.copy(p3).add(tmp);

    // Mantém os controles dentro de um volume folgado, senão o arco "estoura" o mapa
    p1.y = clamp(p1.y, FLIGHT_BOUNDS.minY - 4, FLIGHT_BOUNDS.maxY + 6);
    p2.y = clamp(p2.y, FLIGHT_BOUNDS.minY - 4, FLIGHT_BOUNDS.maxY + 6);

    const speed = lerp(9, 21, difficulty) * randRange(0.85, 1.2);
    state.duration = clamp(distance / speed, escape ? 0.7 : 0.75, 3.2);
    state.t = 0;
    state.segment++;
    return state.duration;
  };

  const reset = (start, difficulty) => {
    position.copy(start);
    previous.copy(start);
    velocity.set(0, 0, 0);
    state.segment = 0;
    state.seed = Math.random() * 1000;
    state.noiseAmplitude = lerp(0.6, 1.9, difficulty);
    state.noiseSpeed = lerp(0.7, 1.5, difficulty);
    retarget(difficulty);
  };

  /**
   * Avança a simulação. Retorna `true` quando um trecho terminou — quem chama decide
   * se sorteia outro (voo normal) ou muda de estado (fuga, morte).
   */
  const update = (dt, elapsed, difficulty) => {
    previous.copy(position);
    state.t = Math.min(1, state.t + dt / state.duration);

    cubicBezierVec(position, p0, p1, p2, p3, state.t);

    // Perlin por cima da curva: micro-turbulência, não mudança de rota
    const n = elapsed * state.noiseSpeed + state.seed;
    wobble.set(
      noise.noise2D(n, 0) * state.noiseAmplitude,
      noise.noise2D(0, n) * state.noiseAmplitude * 0.7,
      noise.noise2D(n * 0.7, n * 0.3) * state.noiseAmplitude * 0.5,
    );
    position.add(wobble);

    velocity.subVectors(position, previous).divideScalar(Math.max(dt, 1e-4));
    tangent.copy(velocity).normalize();

    return state.t >= 1;
  };

  return {
    position,
    velocity,
    tangent,
    state,
    reset,
    retarget,
    update,
    get progress() {
      return state.t;
    },
  };
};
