import { Vector3 } from 'three';
import { createDuckFlock } from './duck/duckPool.js';
import { createDog } from './dog/dog.js';
import { createScore } from './score.js';
import { createShooting } from '../systems/shooting.js';
import { computeRoundPlan } from './difficulty.js';
import { GAME_MODES } from './modes.js';
import { DUCK_VARIANTS } from './duck/duckModel.js';

export const PHASE = {
  IDLE: 'idle',
  INTRO: 'intro',
  ROUND: 'round',
  ROUND_END: 'roundEnd',
  GAME_OVER: 'gameOver',
};

const INITIAL_LIVES = 3;
const impactPoint = new Vector3();

/**
 * Núcleo do jogo — porte direto da classe `Game` original.
 *
 * O fluxo é o mesmo: cão entra, rodada começa, ela termina por munição zerada,
 * todos os patos abatidos ou estouro do cronômetro (`moves` segundos); o cão aparece
 * com a caça; menos de 90% de abates custa uma vida; três vidas perdidas encerram
 * a partida com pontos, rodada, acertos e precisão. As diferenças são de meio, não
 * de regra: temporizadores rodam por delta time (pausáveis) em vez de `setTimeout`,
 * e os três modos viram configuração em vez de subclasses.
 */
export const createGame = ({
  scene,
  camera,
  cameraRig,
  weapon,
  particles,
  audio,
  events,
  renderer,
  assets,
  animations,
}) => {
  const flock = createDuckFlock({ scene, events, assets, animations });
  // O cão é sempre procedural neste build — não há GLTF autoral para ele ainda
  const dog = createDog({ scene, events });
  const score = createScore({ events });
  const shooting = createShooting({ camera, flock, initialAmmo: 3 });

  const state = {
    phase: PHASE.IDLE,
    mode: GAME_MODES.classic,
    lives: INITIAL_LIVES,
    roundTimeLeft: 0,
    roundProgress: 0,
    plan: null,
    fireCooldown: 0,
    firing: false,
  };

  const emitHud = () => {
    events.emit('hud:update', {
      points: score.state.points,
      level: score.state.level,
      lives: state.lives,
      ammo: shooting.ammo,
      maxAmmo: state.plan?.ammo ?? state.mode.ammo,
      streak: score.state.streak,
      multiplier: score.multiplier,
      progress: state.roundProgress,
      timeLeft: state.roundTimeLeft,
      phase: state.phase,
    });
  };

  const startNewRound = () => {
    score.addLevel();
    const plan = computeRoundPlan({
      mode: state.mode,
      level: score.state.level,
      score: score.state.points,
    });
    state.plan = plan;
    state.roundTimeLeft = plan.roundSeconds;
    state.roundProgress = 0;
    state.phase = PHASE.ROUND;

    shooting.setInitialAmmo(plan.ammo);
    shooting.reset();
    shooting.enable();
    flock.startRound({ count: plan.ducks, difficulty: plan.difficulty });

    events.emit('round:start', { level: score.state.level, ...plan });
    emitHud();
  };

  const finishGame = () => {
    state.phase = PHASE.GAME_OVER;
    shooting.disable();
    flock.clear();
    dog.stop();
    const best = score.commitBest();
    events.emit('game:over', {
      points: score.state.points,
      level: score.state.level,
      hits: score.state.hits,
      shots: score.state.shots,
      accuracy: score.accuracy,
      bestStreak: score.state.bestStreak,
      best,
    });
  };

  const subtractLives = () => {
    state.lives--;
    events.emit('game:life-lost', state.lives);
    if (state.lives < 1) finishGame();
  };

  const finishRound = () => {
    if (state.phase !== PHASE.ROUND) return;
    state.phase = PHASE.ROUND_END;
    state.roundTimeLeft = 0;

    shooting.disable();
    flock.flyOutRemaining();

    const killed = flock.round.killed;
    state.roundProgress = flock.killedPercent();
    events.emit('round:end', { killed, percent: state.roundProgress });

    const passed = state.roundProgress >= (state.plan?.passThreshold ?? 90);
    dog.playRetrieve(killed, () => {
      if (state.phase !== PHASE.ROUND_END) return;
      if (!passed) subtractLives();
      if (state.phase === PHASE.GAME_OVER) return;
      startNewRound();
    });
    emitHud();
  };

  const checkRoundFinished = () => {
    if (flock.allShot() || shooting.isEmpty) finishRound();
  };

  const resolveHits = (hits) => {
    let killed = 0;
    for (const duck of hits) {
      if (!duck.kill()) continue;
      flock.registerKill();
      killed++;
      impactPoint.copy(duck.container.position);
      particles.emitFeathers(impactPoint, {
        count: 14 + killed * 4,
        hex: DUCK_VARIANTS[duck.variant]?.body ?? '#ffffff',
      });
      audio.playAt('quack', impactPoint, { volume: 0.8, rate: 0.75 });
      audio.playAt('fall', impactPoint, { volume: 0.45, rate: 1 });
    }
    return killed;
  };

  /** Um disparo. Equivalente a `Game.shoot()` / `ExtremeGame.shoot()`. */
  const shoot = (pointer) => {
    if (state.phase !== PHASE.ROUND) return;

    const result = shooting.fire(pointer);

    if (result.dry) {
      weapon.dryFire();
      audio.play('empty', { volume: 0.6 });
      emitHud();
      return;
    }
    if (!result.fired) return;

    score.registerShot();
    weapon.fire();
    cameraRig.addShake(state.mode.autoFire ? 0.45 : 1);
    audio.play('shot', { volume: 0.9, rate: 0.95 + Math.random() * 0.1 });
    audio.play('pump', { volume: 0.35, rate: 1.1 });

    const killed = resolveHits(result.hits);

    if (killed > 0) {
      const gained = score.addHits(result.hits);
      state.roundProgress = flock.killedPercent();
      renderer.setFocus(result.distance);
      if (killed > 1) events.emit('combo', { count: killed, gained });
      audio.play('ding', { volume: 0.35, rate: 1 + killed * 0.12 });
    } else {
      score.breakStreak();
    }

    events.emit('shot:fired', { killed, ammo: shooting.ammo });
    emitHud();
    checkRoundFinished();
  };

  const start = (modeId) => {
    state.mode = GAME_MODES[modeId] ?? GAME_MODES.classic;
    state.lives = INITIAL_LIVES;
    state.phase = PHASE.INTRO;
    state.roundProgress = 0;
    state.fireCooldown = 0;
    score.reset();
    shooting.disable();
    flock.clear();

    events.emit('game:start', state.mode);
    emitHud();
    dog.playIntro(() => {
      if (state.phase !== PHASE.INTRO) return;
      startNewRound();
    });
  };

  const stop = () => {
    state.phase = PHASE.IDLE;
    shooting.disable();
    flock.clear();
    dog.stop();
  };

  const setFiring = (firing) => {
    state.firing = firing;
    if (firing) state.fireCooldown = 0;
  };

  const update = (dt, elapsed, pointer) => {
    dog.update(dt);
    flock.update(dt, elapsed);

    if (state.phase !== PHASE.ROUND) return;

    // Cronômetro da rodada — `moves` segundos, como `setCountdownToRoundEnd()`
    state.roundTimeLeft -= dt;
    if (state.roundTimeLeft <= 0) {
      finishRound();
      return;
    }

    // Tiro automático do modo EXTREMO
    state.fireCooldown -= dt;
    if (state.firing && state.mode.autoFire && state.fireCooldown <= 0) {
      state.fireCooldown = state.mode.fireRate;
      shoot(pointer);
    }
  };

  return {
    state,
    score,
    flock,
    dog,
    shooting,
    start,
    stop,
    shoot,
    setFiring,
    update,
    get phase() {
      return state.phase;
    },
    dispose: () => {
      flock.dispose();
      dog.dispose();
    },
  };
};
