import { Vector2 } from 'three';
import { createEmitter } from '../utils/events.js';
import { clamp } from '../utils/math.js';

const GAMEPAD_DEADZONE = 0.14;

/**
 * Entrada unificada: mouse, touch e gamepad alimentam o mesmo ponteiro em NDC.
 * Emite `firestart` / `fireend` (o modo EXTREME usa o hold) e `fire` (disparo único).
 */
export const createInput = (domElement) => {
  const emitter = createEmitter();
  const pointer = new Vector2(0, 0);
  const state = { firing: false, usingGamepad: false, gamepadIndex: null };

  const setFromClient = (clientX, clientY) => {
    const rect = domElement.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    emitter.emit('move', pointer);
  };

  const startFire = () => {
    if (state.firing) return;
    state.firing = true;
    emitter.emit('firestart', pointer);
    emitter.emit('fire', pointer);
  };

  const endFire = () => {
    if (!state.firing) return;
    state.firing = false;
    emitter.emit('fireend', pointer);
  };

  const onPointerMove = (e) => {
    state.usingGamepad = false;
    setFromClient(e.clientX, e.clientY);
  };

  const onPointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    domElement.setPointerCapture?.(e.pointerId);
    setFromClient(e.clientX, e.clientY);
    startFire();
  };

  const onPointerUp = (e) => {
    domElement.releasePointerCapture?.(e.pointerId);
    endFire();
  };

  const onContextMenu = (e) => e.preventDefault();
  const onBlur = () => endFire();

  domElement.addEventListener('pointermove', onPointerMove, { passive: true });
  domElement.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('blur', onBlur);
  domElement.addEventListener('contextmenu', onContextMenu);
  domElement.style.touchAction = 'none';

  window.addEventListener('gamepadconnected', (e) => {
    state.gamepadIndex = e.gamepad.index;
    emitter.emit('gamepad', true);
  });
  window.addEventListener('gamepaddisconnected', () => {
    state.gamepadIndex = null;
    emitter.emit('gamepad', false);
  });

  const applyDeadzone = (v) => (Math.abs(v) < GAMEPAD_DEADZONE ? 0 : v);

  /** Polling do gamepad: stick move o ponteiro virtual, gatilho/A dispara. */
  const pollGamepad = (dt) => {
    if (state.gamepadIndex === null) return;
    const pad = navigator.getGamepads?.()[state.gamepadIndex];
    if (!pad) return;

    const ax = applyDeadzone(pad.axes[2] ?? 0) || applyDeadzone(pad.axes[0] ?? 0);
    const ay = applyDeadzone(pad.axes[3] ?? 0) || applyDeadzone(pad.axes[1] ?? 0);

    if (ax || ay) {
      state.usingGamepad = true;
      pointer.x = clamp(pointer.x + ax * dt * 1.9, -1, 1);
      pointer.y = clamp(pointer.y - ay * dt * 1.9, -1, 1);
      emitter.emit('move', pointer);
    }

    const trigger = (pad.buttons[7]?.value ?? 0) > 0.4 || pad.buttons[0]?.pressed;
    if (trigger) startFire();
    else endFire();
  };

  return {
    pointer,
    state,
    on: emitter.on,
    update: pollGamepad,
    dispose: () => {
      domElement.removeEventListener('pointermove', onPointerMove);
      domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('blur', onBlur);
      domElement.removeEventListener('contextmenu', onContextMenu);
      emitter.clear();
    },
  };
};
