import { Group, Sphere, Vector3, MathUtils } from 'three';
import { createDuckBrain, FLIGHT_BOUNDS } from './duckAi.js';
import { DUCK_VARIANTS } from './duckModel.js';
import { heightAt } from '../../world/terrain.js';
import { clamp, damp, lerp, randRange, angleDelta, TAU } from '../../utils/math.js';

export const DUCK_STATE = {
  INACTIVE: 'inactive',
  TAKEOFF: 'takeoff',
  FLYING: 'flying',
  ESCAPING: 'escaping',
  HIT: 'hit',
  FALLING: 'falling',
};

const GRAVITY = 26;
const HITBOX_RADIUS = 0.95;

/**
 * Entidade Pato.
 *
 * Máquina de estados equivalente à do jogo original (voo → abatido → queda → fuga),
 * mas em 3D: a rota vem do `duckBrain` (Bézier + Perlin), a orientação segue a tangente
 * da curva e a inclinação lateral é derivada da taxa de curva — o pato "se apoia" na
 * virada como um pássaro de verdade.
 */
export const createDuck = ({ id, model: initialModel, events }) => {
  // O modelo é trocável em runtime (variantes de pato) sem recriar a entidade
  let model = initialModel;

  const container = new Group();
  container.name = `duck-${id}`;
  container.add(model.scene);

  const brain = createDuckBrain();
  const hitSphere = new Sphere(new Vector3(), HITBOX_RADIUS);
  const lookTarget = new Vector3();
  const spin = new Vector3();
  const fallVelocity = new Vector3();

  const duck = {
    id,
    container,
    hitSphere,
    state: DUCK_STATE.INACTIVE,
    variant: 'mallard',
    scoreMultiplier: 1,
    isAlive: false,
    moves: 0,
    difficulty: 0,
  };

  let flapPhase = 0;
  let stateTime = 0;
  let bank = 0;
  let bodyScale = 1;

  const setState = (next) => {
    duck.state = next;
    stateTime = 0;
  };

  const applyPose = (dt, elapsed, flapSpeed, flapAmount) => {
    // Modelo GLTF sem os pivôs nomeados: quem anima é o AnimationMixer
    if (!model.parts?.wingLeft?.shoulder) return;

    flapPhase += dt * flapSpeed;
    const flap = Math.sin(flapPhase);
    const delayed = Math.sin(flapPhase - 0.7);

    const { wingLeft, wingRight, head, body } = model.parts;
    wingLeft.shoulder.rotation.z = flap * flapAmount;
    wingRight.shoulder.rotation.z = -flap * flapAmount;
    wingLeft.elbow.rotation.z = delayed * flapAmount * 0.55;
    wingRight.elbow.rotation.z = -delayed * flapAmount * 0.55;
    // Asa também avança/recua um pouco: bater reto parece brinquedo
    wingLeft.shoulder.rotation.y = delayed * 0.16;
    wingRight.shoulder.rotation.y = -delayed * 0.16;

    // Pescoço: contra-oscila a batida e olha levemente para a direção do voo
    head.rotation.x = -0.06 + flap * 0.05;
    head.rotation.y = Math.sin(elapsed * 1.3 + duck.id) * 0.14;
    head.position.y = 0.06 - flap * 0.015;

    body.rotation.x = flap * 0.035;
    body.scale.setScalar(bodyScale);
  };

  const orient = (dt) => {
    if (brain.tangent.lengthSq() < 1e-6) return;
    const previousYaw = container.rotation.y;
    lookTarget.copy(brain.position).add(brain.tangent);
    container.position.copy(brain.position);
    container.lookAt(lookTarget);

    const yawRate = angleDelta(previousYaw, container.rotation.y) / Math.max(dt, 1e-4);
    bank = damp(bank, clamp(-yawRate * 0.42, -1.05, 1.05), 6, dt);
    container.rotateZ(bank);
  };

  const spawn = ({ position, difficulty, variant }) => {
    duck.variant = variant;
    duck.scoreMultiplier = DUCK_VARIANTS[variant]?.score ?? 1;
    duck.difficulty = difficulty;
    duck.isAlive = true;
    duck.moves = 0;

    bodyScale = 1;
    bank = 0;
    flapPhase = Math.random() * TAU;
    container.visible = true;
    container.position.copy(position);
    container.rotation.set(0, randRange(0, TAU), 0);
    container.scale.setScalar(1);

    brain.reset(position, difficulty);
    setState(DUCK_STATE.TAKEOFF);
  };

  /** Abatido: trava o voo, cai com gravidade e giro — o "hit" do original, em 3D. */
  const kill = () => {
    if (!duck.isAlive) return false;
    duck.isAlive = false;
    fallVelocity.set(brain.velocity.x * 0.25, 2.2, brain.velocity.z * 0.25);
    spin.set(randRange(-4, 4), randRange(-3, 3), randRange(-7, 7));
    setState(DUCK_STATE.HIT);
    events?.emit('duck:hit', duck);
    return true;
  };

  /** Fuga no fim da rodada — equivalente ao `flyOut()` original. */
  const flyOut = () => {
    if (!duck.isAlive || duck.state === DUCK_STATE.ESCAPING) return;
    setState(DUCK_STATE.ESCAPING);
    brain.retarget(duck.difficulty, { escape: true });
    events?.emit('duck:escape', duck);
  };

  const deactivate = () => {
    duck.isAlive = false;
    container.visible = false;
    setState(DUCK_STATE.INACTIVE);
  };

  const update = (dt, elapsed) => {
    stateTime += dt;

    switch (duck.state) {
      case DUCK_STATE.TAKEOFF: {
        // Arranque: sobe rápido batendo forte antes de entrar em rota
        const t = clamp(stateTime / 0.75, 0, 1);
        brain.position.y += 7 * dt;
        container.position.copy(brain.position);
        container.position.y += Math.sin(t * Math.PI) * 0.4;
        applyPose(dt, elapsed, 26, 1.15);
        if (stateTime >= 0.75) {
          brain.retarget(duck.difficulty);
          setState(DUCK_STATE.FLYING);
        }
        break;
      }

      case DUCK_STATE.FLYING: {
        if (brain.update(dt, elapsed, duck.difficulty)) {
          duck.moves++;
          brain.retarget(duck.difficulty);
        }
        orient(dt);
        const speed = brain.velocity.length();
        applyPose(dt, elapsed, lerp(11, 19, clamp(speed / 22, 0, 1)), lerp(0.55, 0.95, clamp(speed / 20, 0, 1)));
        break;
      }

      case DUCK_STATE.ESCAPING: {
        brain.update(dt, elapsed, duck.difficulty);
        orient(dt);
        applyPose(dt, elapsed, 24, 1.1);
        if (brain.position.y > FLIGHT_BOUNDS.maxY + 22 || stateTime > 3.5) deactivate();
        break;
      }

      case DUCK_STATE.HIT: {
        // Instante de impacto: asas travadas para cima, corpo comprime
        const { wingLeft, wingRight, body } = model.parts ?? {};
        if (wingLeft?.shoulder) {
          wingLeft.shoulder.rotation.z = -1.25;
          wingRight.shoulder.rotation.z = 1.25;
          wingLeft.elbow.rotation.z = -0.5;
          wingRight.elbow.rotation.z = 0.5;
          bodyScale = damp(bodyScale, 1, 9, dt);
          body.scale.setScalar(bodyScale);
        }
        container.rotation.z += dt * 3;
        if (stateTime > 0.18) {
          bodyScale = 1;
          setState(DUCK_STATE.FALLING);
        }
        break;
      }

      case DUCK_STATE.FALLING: {
        fallVelocity.y -= GRAVITY * dt;
        container.position.addScaledVector(fallVelocity, dt);
        container.rotation.x += spin.x * dt;
        container.rotation.y += spin.y * dt;
        container.rotation.z += spin.z * dt;

        const { wingLeft, wingRight } = model.parts ?? {};
        if (wingLeft?.shoulder) {
          const limp = Math.sin(stateTime * 9) * 0.25;
          wingLeft.shoulder.rotation.z = -0.9 + limp;
          wingRight.shoulder.rotation.z = 0.9 - limp;
        }

        const ground = heightAt(container.position.x, container.position.z);
        if (container.position.y <= ground + 0.3) {
          container.position.y = ground + 0.3;
          events?.emit('duck:land', {
            duck,
            position: container.position,
            variant: duck.variant,
          });
          deactivate();
        }
        break;
      }

      default:
        return;
    }

    hitSphere.center.copy(container.position);
  };

  hitSphere.center.copy(container.position);
  container.visible = false;

  // O objeto `duck` é mutado in-place pelos estados; anexar os métodos nele evita
  // uma segunda cópia que sairia de sincronia com a máquina de estados.
  Object.defineProperty(duck, 'isActive', {
    get: () => duck.state !== DUCK_STATE.INACTIVE,
  });

  return Object.assign(duck, {
    spawn,
    kill,
    flyOut,
    deactivate,
    update,
    setModel: (next) => (model = next),
    setDifficulty: (d) => (duck.difficulty = MathUtils.clamp(d, 0, 1)),
  });
};
