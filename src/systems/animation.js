import { AnimationMixer, LoopRepeat, LoopOnce } from 'three';

/**
 * Registro de AnimationMixers.
 *
 * Os modelos procedurais são animados por código (não têm clips), mas todo asset
 * GLTF carregado pelo AssetManager passa por aqui: `register` devolve um controlador
 * com crossfade por nome, e o loop principal só chama `update`. É o caminho pronto
 * para quando os modelos autorais substituírem os procedurais.
 */
export const createAnimationSystem = () => {
  const mixers = new Set();

  const register = (object, clips = []) => {
    const mixer = new AnimationMixer(object);
    mixers.add(mixer);

    const actions = new Map();
    clips.forEach((clip) => actions.set(clip.name, mixer.clipAction(clip)));

    let current = null;

    const play = (name, { fade = 0.25, once = false, speed = 1 } = {}) => {
      const next = actions.get(name);
      if (!next || next === current) return current;

      next.reset();
      next.setEffectiveTimeScale(speed);
      next.setLoop(once ? LoopOnce : LoopRepeat, Infinity);
      next.clampWhenFinished = once;

      if (current) next.crossFadeFrom(current, fade, false);
      next.play();
      current = next;
      return next;
    };

    return {
      mixer,
      actions,
      play,
      stop: () => {
        mixer.stopAllAction();
        current = null;
      },
      dispose: () => {
        mixer.stopAllAction();
        mixer.uncacheRoot(object);
        mixers.delete(mixer);
      },
      get clipNames() {
        return [...actions.keys()];
      },
      get isEmpty() {
        return actions.size === 0;
      },
    };
  };

  return {
    register,
    update: (dt) => mixers.forEach((mixer) => mixer.update(dt)),
    dispose: () => mixers.clear(),
  };
};
