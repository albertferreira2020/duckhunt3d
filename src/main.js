import { createEmitter } from './utils/events.js';
import { settings } from './core/settings.js';
import { createEngine } from './core/engine.js';
import { createCameraRig } from './core/camera.js';
import { createEnvironment } from './core/environment.js';
import { createRenderer } from './core/renderer.js';
import { createInput } from './core/input.js';
import { createAssetManager } from './core/assets.js';
import { createWorld } from './world/index.js';
import { createParticles } from './systems/particles.js';
import { createAudio } from './systems/audio.js';
import { createAnimationSystem } from './systems/animation.js';
import { createShotgun } from './game/weapon/shotgun.js';
import { createGame } from './game/game.js';
import { createHud } from './game/ui/hud.js';
import { createMenu } from './game/ui/menu.js';
import { createDuckModel } from './game/duck/duckModel.js';
import { createDogModel } from './game/dog/dogModel.js';

const canvas = document.getElementById('viewport');
const uiRoot = document.getElementById('ui-root');

/** Cede um frame ao browser para a barra de carregamento realmente andar. */
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

const boot = async () => {
  const events = createEmitter();

  // ---------- Interface primeiro: o usuário vê progresso desde o frame 1 ----------
  const menu = createMenu({
    root: uiRoot,
    events,
    onStart: (modeId) => startGame(modeId),
    onWeatherChange: (key) => applyWeather(key),
  });
  const hud = createHud({ root: uiRoot, events });

  const step = async (progress, text, fn) => {
    menu.setProgress(progress);
    menu.setLoadingText(text);
    await nextFrame();
    return fn?.();
  };

  // ---------- Núcleo ----------
  const cameraRig = await step(0.05, 'Preparando a câmera…', createCameraRig);
  const { camera } = cameraRig;

  const environment = await step(0.12, 'Levantando o céu…', createEnvironment);
  const { scene } = environment;
  scene.add(camera);

  const renderPipeline = await step(0.2, 'Ligando o renderizador…', () =>
    createRenderer({ canvas, scene, camera }),
  );

  // ---------- Assets: procedural por padrão, GLTF quando existir ----------
  const assets = createAssetManager({ onProgress: (t) => menu.setProgress(0.2 + t * 0.1) });
  assets.registerProcedural('duck', createDuckModel);
  assets.registerProcedural('dog', createDogModel);

  const animations = createAnimationSystem();

  // ---------- Cenário ----------
  const world = await step(0.36, 'Plantando o campo…', () => createWorld(scene));

  // `audio` só existe mais adiante; o clima é aplicado antes dele
  let audio = null;

  const applyWeather = (key) => {
    const preset = environment.applyWeather(key, renderPipeline.renderer);
    world.applyWeather(preset);
    renderPipeline.renderer.toneMappingExposure = preset.exposure;
    audio?.setWind(preset.rain > 0 ? 1 : 0.55);
    return preset;
  };

  await step(0.62, 'Ajustando a luz…', () => applyWeather(settings.get('weather')));

  // ---------- Sistemas ----------
  const particles = await step(0.7, 'Soltando as penas…', () => createParticles(scene));
  audio = await step(0.78, 'Afinando o vento…', () => createAudio({ camera, scene }));
  const weapon = await step(0.86, 'Carregando a espingarda…', () =>
    createShotgun({ camera, scene, particles }),
  );

  const game = await step(0.94, 'Soltando os patos…', () =>
    createGame({
      scene,
      camera,
      cameraRig,
      weapon,
      particles,
      audio,
      events,
      assets,
      animations,
      renderer: renderPipeline,
    }),
  );

  // ---------- Entrada ----------
  const input = createInput(canvas);

  input.on('move', (pointer) => {
    cameraRig.aimAt(pointer.x, pointer.y);
    hud.setPointer(pointer);
  });

  input.on('fire', (pointer) => {
    audio.resume();
    audio.startAmbience();
    // No modo automático quem dispara é o cooldown do loop, para não duplicar o tiro
    if (!game.state.mode.autoFire) game.shoot(pointer);
  });

  input.on('firestart', () => game.setFiring(true));
  input.on('fireend', () => game.setFiring(false));

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      game.stop();
      hud.setVisible(false);
      menu.showStart();
    }
    if (e.code === 'F3') {
      e.preventDefault();
      settings.set('debug', !settings.get('debug'));
    }
  });

  // ---------- Eventos de jogo ----------
  events.on('dog:laugh', () => audio.play('laugh', { volume: 0.7 }));
  events.on('dog:retrieve', () => audio.play('bark', { volume: 0.6 }));
  events.on('dog:intro', () => audio.play('bark', { volume: 0.5, rate: 1.1 }));
  events.on('duck:land', ({ position }) => {
    audio.playAt('thud', position, { volume: 0.7 });
    particles.emitImpact(position);
    particles.emitDust(position, 14);
  });
  events.on('round:ducks-launched', (count) => {
    for (let i = 0; i < Math.min(count, 4); i++) {
      setTimeout(() => audio.play('quack', { volume: 0.45, rate: 0.9 + Math.random() * 0.35 }), i * 130);
    }
  });
  events.on('game:over', () => hud.setVisible(false));

  const startGame = (modeId) => {
    audio.resume();
    audio.startAmbience();
    hud.setVisible(true);
    game.start(modeId);
  };

  // ---------- Ferramenta de desenvolvimento (removida no build de produção) ----------
  let controls = null;
  if (import.meta.env.DEV) {
    const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
    controls = new OrbitControls(camera, canvas);
    controls.enabled = false;
    controls.enableDamping = true;
    // Ativado só sob demanda: `window.__orbit(true)` no console
    window.__orbit = (on) => (controls.enabled = on);
  }

  // ---------- Loop ----------
  const engine = createEngine({ render: () => renderPipeline.render() });

  engine.add((dt, elapsed) => {
    input.update(dt);
    if (!controls?.enabled) cameraRig.update(dt);
    else controls.update();

    environment.update(elapsed);
    world.update(dt, elapsed, camera);
    game.update(dt, elapsed, input.pointer);
    weapon.update(dt, { pointer: input.pointer, firing: game.state.firing });
    particles.update(dt, elapsed);
    animations.update(dt);
    audio.update(dt);
    hud.tick(dt, engine.fps);
    cameraRig.setFovBoost(weapon.recoil);
  });

  if (import.meta.env.DEV) Object.assign(window, { __game: game, __engine: engine, __world: world });

  await step(1, 'Pronto.', () => null);
  menu.finishLoading();
  menu.showStart();
  engine.start();

  window.addEventListener('beforeunload', () => {
    engine.stop();
    [game, weapon, particles, audio, world, environment, renderPipeline, input, hud, menu].forEach(
      (m) => m.dispose?.(),
    );
  });
};

boot().catch((error) => {
  console.error('[DuckHunt3D] falha no boot', error);
  uiRoot.innerHTML = `
    <div class="overlay" data-open="true">
      <div class="card">
        <h1 class="card__title">Não foi possível iniciar</h1>
        <p class="card__subtitle">${error.message}</p>
      </div>
    </div>`;
});
