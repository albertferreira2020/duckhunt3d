import { Group, Vector3 } from 'three';
import { createDogModel } from './dogModel.js';
import { instantiateDuckModel } from '../duck/duckModel.js';
import { heightAt } from '../../world/terrain.js';
import { lerp, clamp, smoothstep, damp } from '../../utils/math.js';

const DOG_Z = 7.5;
const DOG_SCALE = 1.7;

/** Sequenciador mínimo: lista de trechos com duração, entrada e update normalizado. */
const createTimeline = () => {
  let steps = [];
  let index = 0;
  let time = 0;
  let onDone = null;

  return {
    get running() {
      return index < steps.length;
    },
    play: (nextSteps, done) => {
      steps = nextSteps;
      index = 0;
      time = 0;
      onDone = done;
      steps[0]?.enter?.();
    },
    stop: () => {
      steps = [];
      index = 0;
      onDone = null;
    },
    update: (dt) => {
      if (index >= steps.length) return;
      time += dt;
      const step = steps[index];
      step.update?.(clamp(time / step.duration, 0, 1), dt);
      if (time < step.duration) return;
      time = 0;
      index++;
      if (index < steps.length) steps[index].enter?.();
      else onDone?.();
    },
  };
};

/**
 * O cão do Duck Hunt, em 3D.
 *
 * Reproduz as duas sequências do original — a caminhada de abertura de 7,3 s
 * (andar, farejar, andar, farejar, achar, pular) e a aparição de fim de rodada com
 * os patos abatidos, incluindo a risada quando o jogador não acerta nenhum.
 * Todas as poses são procedurais; se um GLTF com clips for carregado, o mixer
 * assume no lugar (ver `systems/animation.js`).
 */
export const createDog = ({ scene, events }) => {
  const root = new Group();
  root.name = 'dog-rig';
  scene.add(root);

  const model = createDogModel();
  model.scene.scale.setScalar(DOG_SCALE);
  root.add(model.scene);
  root.visible = false;

  const { neck, head, jaw, earLeft, earRight, tail, legs, mouthAnchor } = model.parts;
  const timeline = createTimeline();
  const carried = [];
  const basePosition = new Vector3();

  let gaitPhase = 0;
  let bodyBounce = 0;
  let headTilt = 0;

  const groundAt = (x, z) => heightAt(x, z);

  const placeAt = (x, z, yOffset = 0) => {
    root.position.set(x, groundAt(x, z) + 0.62 * DOG_SCALE + yOffset, z);
  };

  const setGait = (dt, speed, amplitude) => {
    gaitPhase += dt * speed;
    legs.forEach((leg, i) => {
      // Trote diagonal: dianteira esquerda em fase com traseira direita
      const offset = (leg.front ? 0 : Math.PI) + (leg.left ? 0 : Math.PI);
      const swing = Math.sin(gaitPhase + offset);
      leg.hip.rotation.x = swing * amplitude;
      leg.knee.rotation.x = Math.max(0, -Math.sin(gaitPhase + offset - 0.8)) * amplitude * 1.1;
    });
    bodyBounce = Math.abs(Math.sin(gaitPhase)) * amplitude * 0.09;
    tail.rotation.z = Math.sin(gaitPhase * 1.6) * 0.5;
    tail.rotation.x = -0.7 - Math.sin(gaitPhase) * 0.15;
  };

  const restPose = (dt) => {
    legs.forEach((leg) => {
      leg.hip.rotation.x = damp(leg.hip.rotation.x, 0, 10, dt);
      leg.knee.rotation.x = damp(leg.knee.rotation.x, 0, 10, dt);
    });
  };

  const setEars = (droop) => {
    earLeft.rotation.z = -droop;
    earRight.rotation.z = droop;
    earLeft.rotation.x = droop * 0.4;
    earRight.rotation.x = droop * 0.4;
  };

  const clearCarried = () => {
    carried.forEach((d) => mouthAnchor.remove(d));
    carried.length = 0;
  };

  const carryDucks = (count) => {
    clearCarried();
    for (let i = 0; i < count; i++) {
      const duck = instantiateDuckModel('mallard').scene;
      duck.scale.setScalar(0.62);
      duck.rotation.set(Math.PI * 0.5, 0, i === 0 ? 0.35 : -0.35);
      duck.position.set(i === 0 ? -0.12 : 0.12, -0.05 - i * 0.08, 0.16);
      mouthAnchor.add(duck);
      carried.push(duck);
    }
  };

  const applyTransforms = () => {
    model.scene.position.y = bodyBounce;
    neck.rotation.x = headTilt;
  };

  /** Abertura: 7,3 s — mesmos tempos da animação original. */
  const playIntro = (onComplete) => {
    root.visible = true;
    clearCarried();
    setEars(0.2);
    headTilt = 0;
    events?.emit('dog:intro');

    const walk = (fromX, toX) => (t, dt) => {
      const x = lerp(fromX, toX, smoothstep(t));
      placeAt(x, DOG_Z);
      root.rotation.y = Math.PI * 0.5;
      setGait(dt, 11, 0.55);
      headTilt = damp(headTilt, 0.1, 6, dt);
      applyTransforms();
    };

    const sniff = (x) => (t, dt) => {
      placeAt(x, DOG_Z);
      restPose(dt);
      // Focinho no chão, cabeça varrendo o solo
      headTilt = damp(headTilt, 0.85, 8, dt);
      neck.rotation.y = Math.sin(t * Math.PI * 4) * 0.35;
      jaw.rotation.x = Math.sin(t * Math.PI * 8) * 0.12;
      bodyBounce = damp(bodyBounce, 0, 8, dt);
      setEars(0.55);
      applyTransforms();
    };

    timeline.play(
      [
        { duration: 2, update: walk(-17, -7) },
        { duration: 1, update: sniff(-7) },
        { duration: 2, update: walk(-7, 3) },
        { duration: 1, update: sniff(3) },
        {
          // Achou: endireita, orelhas em pé, encara os arbustos
          duration: 0.5,
          update: (t, dt) => {
            placeAt(3, DOG_Z);
            restPose(dt);
            headTilt = damp(headTilt, -0.35, 10, dt);
            neck.rotation.y = damp(neck.rotation.y, 0, 10, dt);
            root.rotation.y = damp(root.rotation.y, Math.PI, 8, dt);
            setEars(lerp(0.55, 0.05, t));
            jaw.rotation.x = 0;
            applyTransforms();
          },
        },
        {
          // Pulo para dentro do mato e desaparece
          duration: 0.8,
          update: (t) => {
            const arc = Math.sin(t * Math.PI);
            placeAt(3, DOG_Z - t * 5, arc * 2.6);
            model.scene.rotation.x = -arc * 0.7;
            legs.forEach((leg) => {
              leg.hip.rotation.x = -0.9 * arc;
              leg.knee.rotation.x = 1.2 * arc;
            });
            tail.rotation.x = -0.7 - arc * 0.6;
            root.scale.setScalar(lerp(1, 0.85, t));
            if (t > 0.86) root.visible = false;
          },
        },
      ],
      () => {
        model.scene.rotation.x = 0;
        root.scale.setScalar(1);
        onComplete?.();
      },
    );
  };

  /**
   * Fim de rodada: sobe atrás do mato mostrando os patos, ou ri se não houve nenhum.
   * Espelha `showDogWithKilledDucks()` (600 ms subindo, 800 ms parado, 600 ms descendo).
   */
  const playRetrieve = (killedDucks, onComplete) => {
    const laughing = killedDucks === 0;
    root.visible = true;
    root.rotation.y = Math.PI;
    root.scale.setScalar(1);
    model.scene.rotation.x = 0;
    carryDucks(Math.min(killedDucks, 2));
    events?.emit(laughing ? 'dog:laugh' : 'dog:retrieve', killedDucks);

    const x = 0;
    const z = 2;
    basePosition.set(x, groundAt(x, z), z);
    const hidden = -2.4;

    const settle = (dt) => {
      restPose(dt);
      bodyBounce = damp(bodyBounce, 0, 8, dt);
    };

    timeline.play(
      [
        {
          duration: 0.6,
          update: (t, dt) => {
            placeAt(x, z, lerp(hidden, 0.2, smoothstep(t)));
            settle(dt);
            headTilt = damp(headTilt, laughing ? -0.5 : -0.15, 8, dt);
            setEars(laughing ? 0.1 : 0.35);
            applyTransforms();
          },
        },
        {
          duration: 0.8,
          update: (t, dt) => {
            placeAt(x, z, 0.2);
            settle(dt);
            if (laughing) {
              // Risada: corpo pulando, cabeça para trás, mandíbula batendo
              const beat = Math.sin(t * Math.PI * 12);
              bodyBounce = Math.abs(beat) * 0.22;
              headTilt = -0.55 - Math.abs(beat) * 0.25;
              jaw.rotation.x = 0.15 + Math.abs(beat) * 0.45;
              root.rotation.z = beat * 0.06;
            } else {
              // Exibindo a caça: leve balanço orgulhoso
              headTilt = -0.15 + Math.sin(t * Math.PI * 3) * 0.06;
              jaw.rotation.x = 0.28;
              tail.rotation.z = Math.sin(t * Math.PI * 8) * 0.7;
            }
            applyTransforms();
          },
        },
        {
          duration: 0.6,
          update: (t, dt) => {
            placeAt(x, z, lerp(0.2, hidden, smoothstep(t)));
            settle(dt);
            jaw.rotation.x = damp(jaw.rotation.x, 0, 8, dt);
            root.rotation.z = damp(root.rotation.z, 0, 8, dt);
            applyTransforms();
          },
        },
      ],
      () => {
        root.visible = false;
        clearCarried();
        onComplete?.();
      },
    );
  };

  return {
    root,
    model,
    playIntro,
    playRetrieve,
    update: (dt) => timeline.update(dt),
    stop: () => {
      timeline.stop();
      root.visible = false;
      clearCarried();
    },
    dispose: () => {
      clearCarried();
      scene.remove(root);
      model.scene.traverse((o) => o.isMesh && o.geometry.dispose());
      model.material.dispose();
    },
  };
};
