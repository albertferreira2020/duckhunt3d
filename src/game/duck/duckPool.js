import { Group, Vector3 } from 'three';
import { createDuck, DUCK_STATE } from './duck.js';
import { instantiateDuckModel, disposeDuckTemplates, resolveDuckParts } from './duckModel.js';
import { heightAt } from '../../world/terrain.js';
import { randRange, clamp } from '../../utils/math.js';

const MAX_DUCKS = 20; // teto do modo EXTREME no jogo original
const spawnPoint = new Vector3();
const hitPoint = new Vector3();

const pickVariant = (difficulty) => {
  const roll = Math.random();
  if (roll < 0.04 + difficulty * 0.03) return 'golden';
  if (roll < 0.26 + difficulty * 0.12) return 'black';
  return 'mallard';
};

/**
 * Porte do `DucksHandler` original: mesmo contrato (iniciar voo, expulsar os restantes,
 * checar se todos foram abatidos, % da rodada), agora sobre um pool de entidades 3D.
 * Nenhum pato é criado ou destruído durante a partida — só reativado.
 */
export const createDuckFlock = ({ scene, events, assets, animations }) => {
  const root = new Group();
  root.name = 'ducks';
  scene.add(root);

  const ducks = [];
  const round = { killed: 0, spawned: 0, difficulty: 0 };

  /**
   * Modelo do pato. Se um `duck.glb` tiver sido carregado pelo AssetManager, ele vence:
   * os pivôs são resolvidos por nome e os clips, se houver, entram no AnimationMixer.
   * Sem GLTF, cai no modelo procedural.
   */
  const buildModel = (variant) => {
    if (!assets?.hasModel('duck')) return instantiateDuckModel(variant);
    const gltf = assets.instantiate('duck');
    const model = { ...gltf, parts: resolveDuckParts(gltf.scene) };
    if (gltf.animations.length) model.mixer = animations?.register(gltf.scene, gltf.animations);
    return model;
  };

  const ensure = (count) => {
    while (ducks.length < Math.min(count, MAX_DUCKS)) {
      const id = ducks.length;
      const model = buildModel('mallard');
      const duck = createDuck({ id, model, events });
      // Cada pato guarda os modelos das outras variantes para trocar sem realocar
      duck.models = { mallard: model };
      root.add(duck.container);
      ducks.push(duck);
    }
  };

  /** Troca a malha visível pela da variante sorteada, criando o clone só na 1ª vez. */
  const useVariant = (duck, variant) => {
    if (!duck.models[variant]) duck.models[variant] = buildModel(variant);
    if (duck.activeModel === variant) return;
    duck.container.clear();
    const model = duck.models[variant];
    duck.container.add(model.scene);
    duck.model = model;
    duck.activeModel = variant;
    duck.setModel?.(model);
  };

  const startRound = ({ count, difficulty }) => {
    ensure(count);
    round.killed = 0;
    round.spawned = Math.min(count, MAX_DUCKS);
    round.difficulty = clamp(difficulty, 0, 1);

    for (let i = 0; i < ducks.length; i++) {
      const duck = ducks[i];
      if (i >= round.spawned) {
        duck.deactivate();
        continue;
      }
      const variant = pickVariant(round.difficulty);
      useVariant(duck, variant);

      // Decolam de pontos distintos do campo, atrás da cerca
      const x = randRange(-26, 26);
      const z = randRange(-26, -6);
      spawnPoint.set(x, heightAt(x, z) + 0.4, z);
      duck.spawn({ position: spawnPoint, difficulty: round.difficulty, variant });
    }
    events?.emit('round:ducks-launched', round.spawned);
  };

  const update = (dt, elapsed) => {
    for (const duck of ducks) if (duck.isActive) duck.update(dt, elapsed);
  };

  /**
   * Raycast contra as esferas de acerto. Esfera em vez de malha é deliberado:
   * é mais rápido, e uma hitbox levemente generosa é o que faz o tiro "sentir" justo.
   */
  const raycast = (ray) => {
    let best = null;
    let bestDistance = Infinity;
    for (const duck of ducks) {
      if (!duck.isAlive || duck.state === DUCK_STATE.INACTIVE) continue;
      if (!ray.intersectSphere(duck.hitSphere, hitPoint)) continue;
      const distance = ray.origin.distanceToSquared(hitPoint);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = duck;
      }
    }
    return best;
  };

  const registerKill = () => (round.killed += 1);

  const flyOutRemaining = () => {
    for (const duck of ducks) if (duck.isAlive) duck.flyOut();
  };

  const clear = () => ducks.forEach((d) => d.deactivate());

  return {
    root,
    ducks,
    round,
    startRound,
    update,
    raycast,
    registerKill,
    flyOutRemaining,
    clear,
    /** Equivalente a `checkAllDucksAreShot()`. */
    allShot: () => round.killed >= round.spawned && round.spawned > 0,
    /** Equivalente a `countPrecentOfDucksKilled()`. */
    killedPercent: () => (round.spawned ? Math.round((round.killed / round.spawned) * 100) : 0),
    get aliveCount() {
      return ducks.reduce((n, d) => n + (d.isAlive ? 1 : 0), 0);
    },
    dispose: () => {
      scene.remove(root);
      disposeDuckTemplates();
    },
  };
};
