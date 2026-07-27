import { PerspectiveCamera, Vector3, Euler, MathUtils } from 'three';
import { settings } from './settings.js';
import { damp, clamp, lerp } from '../utils/math.js';
import { noise } from '../utils/noise.js';

const BASE_POSITION = new Vector3(0, 2.6, 26);
const MAX_YAW = MathUtils.degToRad(42);
const MAX_PITCH_UP = MathUtils.degToRad(46);
const MAX_PITCH_DOWN = MathUtils.degToRad(12);

/**
 * Rig da câmera do atirador.
 *
 * O jogador é estacionário (como no Duck Hunt original), então a câmera não translada:
 * ela orienta-se suavemente na direção do ponteiro, com head-bob de respiração e
 * shake aditivo no disparo. A mira continua sendo o ponteiro real — o raycast usa
 * NDC do ponteiro, não o centro da tela, para não mentir sobre o acerto.
 */
export const createCameraRig = () => {
  const camera = new PerspectiveCamera(58, 1, 0.1, 1200);
  camera.position.copy(BASE_POSITION);

  const target = new Euler(0, 0, 0, 'YXZ');
  const current = new Euler(0, 0, 0, 'YXZ');
  const shake = { amount: 0, time: 0 };
  let bobTime = 0;

  /** `pointer` em NDC (-1..1). Define para onde a câmera se inclina. */
  const aimAt = (pointerX, pointerY) => {
    const s = settings.get('sensitivity');
    const y = settings.get('invertY') ? -pointerY : pointerY;
    target.y = -pointerX * MAX_YAW * s;
    target.x = clamp(y * MAX_PITCH_UP * s, -MAX_PITCH_DOWN, MAX_PITCH_UP);
  };

  const addShake = (amount = 1) => {
    shake.amount = Math.min(shake.amount + amount, 2.2);
  };

  const update = (dt) => {
    bobTime += dt;

    current.x = damp(current.x, target.x, 7, dt);
    current.y = damp(current.y, target.y, 7, dt);

    shake.amount = Math.max(0, shake.amount - dt * 3.4);
    shake.time += dt * 34;

    const decay = shake.amount * shake.amount;
    const shakeX = noise.noise2D(shake.time, 0) * 0.035 * decay;
    const shakeY = noise.noise2D(0, shake.time) * 0.045 * decay;
    const shakeRoll = noise.noise2D(shake.time * 0.7, 4.2) * 0.03 * decay;

    // Head bob: respiração lenta, amplitude baixa o bastante para não enjoar
    const bobY = Math.sin(bobTime * 1.15) * 0.022;
    const bobX = Math.sin(bobTime * 0.73) * 0.016;

    camera.rotation.set(current.x + shakeY + bobY * 0.3, current.y + shakeX + bobX * 0.3, shakeRoll);
    camera.position.set(
      BASE_POSITION.x + bobX,
      BASE_POSITION.y + bobY - decay * 0.05,
      BASE_POSITION.z,
    );
  };

  /** FOV dinâmico — abre levemente no coice, fecha ao mirar parado. */
  const setFovBoost = (t) => {
    const fov = lerp(58, 62, clamp(t, 0, 1));
    if (Math.abs(camera.fov - fov) < 0.01) return;
    camera.fov = fov;
    camera.updateProjectionMatrix();
  };

  return { camera, aimAt, addShake, update, setFovBoost, basePosition: BASE_POSITION };
};
