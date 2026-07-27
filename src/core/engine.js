import { Clock } from 'three';

const MAX_DELTA = 1 / 20; // um frame travado nunca teleporta um pato

/**
 * Loop principal. Sistemas registram-se com `add(fn)` e recebem `(dt, elapsed)`.
 * Delta é clampado e o loop pausa quando a aba perde foco, evitando o salto de
 * simulação clássico ao voltar de outra janela.
 */
export const createEngine = ({ render }) => {
  const clock = new Clock();
  const systems = new Set();
  const fps = { value: 60, accumulator: 0, frames: 0 };
  let running = false;
  let rafId = 0;

  const tick = () => {
    rafId = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), MAX_DELTA);
    const elapsed = clock.elapsedTime;

    fps.accumulator += dt;
    fps.frames++;
    if (fps.accumulator >= 0.5) {
      fps.value = Math.round(fps.frames / fps.accumulator);
      fps.accumulator = 0;
      fps.frames = 0;
    }

    for (const system of systems) system(dt, elapsed);
    render(dt, elapsed);
  };

  const start = () => {
    if (running) return;
    running = true;
    clock.getDelta();
    rafId = requestAnimationFrame(tick);
  };

  const stop = () => {
    running = false;
    cancelAnimationFrame(rafId);
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });

  return {
    add: (fn) => {
      systems.add(fn);
      return () => systems.delete(fn);
    },
    remove: (fn) => systems.delete(fn),
    start,
    stop,
    get fps() {
      return fps.value;
    },
    get elapsed() {
      return clock.elapsedTime;
    },
    get running() {
      return running;
    },
  };
};
