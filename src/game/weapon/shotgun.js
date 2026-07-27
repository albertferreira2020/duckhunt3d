import {
  Group,
  Mesh,
  MeshStandardMaterial,
  MeshBasicMaterial,
  CylinderGeometry,
  BoxGeometry,
  ConeGeometry,
  PointLight,
  AdditiveBlending,
  Vector3,
  Quaternion,
  Color,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createPool } from '../../utils/pool.js';
import { damp, randRange, clamp } from '../../utils/math.js';

const REST = new Vector3(0.29, -0.27, -0.58);
const VIEW_MODEL_SCALE = 0.86;
const AIM_TILT = -0.06;

const buildBarrelGeometry = () => {
  const parts = [];
  const barrel = new CylinderGeometry(0.021, 0.023, 0.72, 12, 1);
  barrel.rotateX(Math.PI / 2);
  barrel.translate(0, 0.018, -0.3);
  parts.push(barrel);

  const magazine = new CylinderGeometry(0.017, 0.017, 0.62, 10, 1);
  magazine.rotateX(Math.PI / 2);
  magazine.translate(0, -0.022, -0.26);
  parts.push(magazine);

  const rib = new BoxGeometry(0.008, 0.006, 0.66);
  rib.translate(0, 0.042, -0.3);
  parts.push(rib);

  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
};

const buildReceiverGeometry = () => {
  const parts = [];
  const receiver = new BoxGeometry(0.056, 0.078, 0.22);
  receiver.translate(0, 0, 0.06);
  parts.push(receiver);

  const trigger = new BoxGeometry(0.014, 0.05, 0.03);
  trigger.translate(0, -0.06, 0.09);
  parts.push(trigger);

  const guard = new BoxGeometry(0.02, 0.012, 0.075);
  guard.translate(0, -0.082, 0.09);
  parts.push(guard);

  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
};

const buildStockGeometry = () => {
  const parts = [];
  const grip = new BoxGeometry(0.05, 0.1, 0.14);
  grip.rotateX(-0.34);
  grip.translate(0, -0.04, 0.21);
  parts.push(grip);

  const stock = new BoxGeometry(0.05, 0.088, 0.26);
  stock.rotateX(-0.1);
  stock.translate(0, -0.03, 0.38);
  parts.push(stock);

  const pad = new BoxGeometry(0.052, 0.1, 0.02);
  pad.translate(0, -0.05, 0.51);
  parts.push(pad);

  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
};

const buildPumpGeometry = () => {
  const g = new BoxGeometry(0.05, 0.05, 0.19);
  g.translate(0, -0.02, -0.32);
  return g;
};

/**
 * Espingarda em primeira pessoa.
 *
 * O modelo é filho da câmera (view model), com coice, flash de boca, fumaça,
 * bombeamento do pump e ejeção de cartuchos. Os cartuchos vivem no espaço do mundo
 * num pool — caem com gravidade e desaparecem sem alocar nada por disparo.
 */
export const createShotgun = ({ camera, scene, particles }) => {
  const group = new Group();
  group.name = 'shotgun';
  group.position.copy(REST);
  group.rotation.set(AIM_TILT, 0.06, 0);
  group.scale.setScalar(VIEW_MODEL_SCALE);
  camera.add(group);

  const metal = new MeshStandardMaterial({ color: '#2f3338', roughness: 0.34, metalness: 0.95 });
  const wood = new MeshStandardMaterial({ color: '#6b4426', roughness: 0.62, metalness: 0.05 });
  const brass = new MeshStandardMaterial({ color: '#c9a227', roughness: 0.35, metalness: 0.9 });

  const barrelGeometry = buildBarrelGeometry();
  const receiverGeometry = buildReceiverGeometry();
  const stockGeometry = buildStockGeometry();
  const pumpGeometry = buildPumpGeometry();

  const barrel = new Mesh(barrelGeometry, metal);
  const receiver = new Mesh(receiverGeometry, metal);
  const stock = new Mesh(stockGeometry, wood);
  const pump = new Mesh(pumpGeometry, wood);
  group.add(barrel, receiver, stock, pump);

  // View model não recebe nem projeta sombra: é geometria de câmera, não de mundo
  group.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false;
    o.receiveShadow = false;
    o.frustumCulled = false;
    o.renderOrder = 10;
  });

  // --- Flash de boca ---
  const muzzleAnchor = new Group();
  muzzleAnchor.position.set(0, 0.018, -0.68);
  group.add(muzzleAnchor);

  const flashGeometry = new ConeGeometry(0.07, 0.2, 7, 1, true);
  flashGeometry.rotateX(-Math.PI / 2);
  const flashMaterial = new MeshBasicMaterial({
    color: new Color('#ffd27a'),
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const flash = new Mesh(flashGeometry, flashMaterial);
  flash.renderOrder = 11;
  flash.frustumCulled = false;
  muzzleAnchor.add(flash);

  const muzzleLight = new PointLight('#ffbe5c', 0, 14, 2);
  muzzleAnchor.add(muzzleLight);

  // --- Cartuchos ejetados (pool em espaço de mundo) ---
  const shellGeometry = new CylinderGeometry(0.011, 0.011, 0.036, 8, 1);
  const shellMaterial = new MeshStandardMaterial({ color: '#b02b2b', roughness: 0.5 });
  const shells = createPool(
    () => {
      const shell = new Group();
      const body = new Mesh(shellGeometry, shellMaterial);
      const rim = new Mesh(shellGeometry, brass);
      rim.scale.set(1.12, 0.3, 1.12);
      rim.position.y = -0.02;
      shell.add(body, rim);
      shell.visible = false;
      shell.userData.velocity = new Vector3();
      shell.userData.spin = new Vector3();
      shell.userData.life = 0;
      scene.add(shell);
      return shell;
    },
    { initial: 6 },
  );

  const worldPosition = new Vector3();
  const worldQuaternion = new Quaternion();
  const tmp = new Vector3();

  const state = {
    recoil: 0,
    pumpOffset: 0,
    flashTime: 0,
    sway: new Vector3(),
  };

  const ejectShell = () => {
    const shell = shells.acquire();
    group.getWorldPosition(worldPosition);
    group.getWorldQuaternion(worldQuaternion);

    shell.position.copy(worldPosition).add(tmp.set(0.06, 0.02, 0.05).applyQuaternion(worldQuaternion));
    shell.quaternion.copy(worldQuaternion);
    shell.visible = true;
    shell.userData.life = 1.6;
    shell.userData.velocity
      .set(randRange(1.6, 2.8), randRange(1.4, 2.2), randRange(0.2, 1))
      .applyQuaternion(worldQuaternion);
    shell.userData.spin.set(randRange(-14, 14), randRange(-14, 14), randRange(-14, 14));
  };

  const fire = () => {
    state.recoil = 1;
    state.flashTime = 0.055;
    flashMaterial.opacity = 1;
    flash.rotation.z = Math.random() * Math.PI;
    flash.scale.setScalar(randRange(0.85, 1.25));
    muzzleLight.intensity = 26;

    muzzleAnchor.getWorldPosition(worldPosition);
    group.getWorldQuaternion(worldQuaternion);
    particles?.emitMuzzle(worldPosition, tmp.set(0, 0, -1).applyQuaternion(worldQuaternion));
    ejectShell();
  };

  /** Disparo sem munição: só o clique seco do pump. */
  const dryFire = () => {
    state.pumpOffset = 0.6;
  };

  const update = (dt, { pointer, firing }) => {
    // Coice: impulso instantâneo, retorno amortecido
    state.recoil = damp(state.recoil, 0, 9, dt);
    state.pumpOffset = damp(state.pumpOffset, state.recoil > 0.35 ? 1 : 0, 14, dt);

    const kick = state.recoil * state.recoil;
    group.position.set(
      REST.x + state.sway.x,
      REST.y + state.sway.y + kick * 0.035,
      REST.z + state.sway.z + kick * 0.09,
    );
    group.rotation.x = AIM_TILT - kick * 0.28;
    group.rotation.z = kick * 0.06;

    // Bombeamento acompanha o coice
    pump.position.z = state.pumpOffset * 0.11;

    // Sway: a arma persegue o ponteiro com atraso — dá peso ao movimento
    state.sway.x = damp(state.sway.x, -pointer.x * 0.05, 6, dt);
    state.sway.y = damp(state.sway.y, -pointer.y * 0.04, 6, dt);
    state.sway.z = damp(state.sway.z, firing ? 0.01 : 0, 8, dt);

    if (state.flashTime > 0) {
      state.flashTime -= dt;
      const t = clamp(state.flashTime / 0.055, 0, 1);
      flashMaterial.opacity = t;
      muzzleLight.intensity = 26 * t;
      if (state.flashTime <= 0) {
        flashMaterial.opacity = 0;
        muzzleLight.intensity = 0;
      }
    }

    for (const shell of shells.active) {
      shell.userData.life -= dt;
      if (shell.userData.life <= 0) {
        shell.visible = false;
        shells.release(shell);
        continue;
      }
      shell.userData.velocity.y -= 22 * dt;
      shell.position.addScaledVector(shell.userData.velocity, dt);
      shell.rotation.x += shell.userData.spin.x * dt;
      shell.rotation.y += shell.userData.spin.y * dt;
      shell.rotation.z += shell.userData.spin.z * dt;
    }
  };

  return {
    group,
    fire,
    dryFire,
    update,
    get recoil() {
      return state.recoil;
    },
    dispose: () => {
      camera.remove(group);
      [barrelGeometry, receiverGeometry, stockGeometry, pumpGeometry, flashGeometry, shellGeometry].forEach(
        (g) => g.dispose(),
      );
      [metal, wood, brass, flashMaterial, shellMaterial].forEach((m) => m.dispose());
    },
  };
};
