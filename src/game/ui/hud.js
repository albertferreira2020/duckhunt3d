import { settings } from '../../core/settings.js';
import { clamp } from '../../utils/math.js';

const template = /* html */ `
  <div class="hud" data-visible="false">
    <div class="hud__panel hud__panel--tl">
      <div class="hud__stat">
        <span class="hud__label">Pontos</span>
        <span class="hud__value hud__value--accent" data-points>0</span>
      </div>
      <div class="hud__stat">
        <span class="hud__label">Rodada</span>
        <span class="hud__value" data-level>0</span>
      </div>
      <div class="hud__stat">
        <span class="hud__label">Combo</span>
        <span class="hud__value" data-multiplier>x1</span>
      </div>
    </div>

    <div class="hud__panel hud__panel--tr">
      <div class="hud__stat">
        <span class="hud__label">Vidas</span>
        <div class="hud__lives" data-lives></div>
      </div>
    </div>

    <div class="hud__panel hud__panel--bl">
      <div class="hud__stat">
        <span class="hud__label">Munição</span>
        <div class="hud__ammo" data-ammo></div>
      </div>
      <span class="hud__ammo-count" data-ammo-count>0</span>
    </div>

    <div class="hud__progress">
      <div class="hud__progress-track">
        <div class="hud__progress-fill" data-progress-fill></div>
      </div>
      <div class="hud__progress-meta">
        <span data-progress-label>0% abatidos</span>
        <span class="hud__timer" data-timer>0.0s</span>
      </div>
    </div>

    <div class="hud__fps" data-fps>60 FPS</div>
    <div class="hud__combo" data-combo></div>
  </div>

  <div class="crosshair" data-crosshair>
    <span class="crosshair__dot"></span>
  </div>
`;

const MAX_SHELL_ICONS = 12;

/**
 * HUD em DOM sobre o canvas.
 *
 * Fica fora do WebGL de propósito: texto nítido em qualquer DPI, acessível, e sem
 * custar drawcall. Só reescreve o nó que mudou — nada de re-render por frame.
 */
export const createHud = ({ root, events }) => {
  const container = document.createElement('div');
  container.innerHTML = template;
  root.appendChild(container);

  const $ = (selector) => container.querySelector(selector);
  const hud = $('.hud');
  const crosshair = $('[data-crosshair]');
  const nodes = {
    points: $('[data-points]'),
    level: $('[data-level]'),
    multiplier: $('[data-multiplier]'),
    lives: $('[data-lives]'),
    ammo: $('[data-ammo]'),
    ammoCount: $('[data-ammo-count]'),
    progressFill: $('[data-progress-fill]'),
    progressLabel: $('[data-progress-label]'),
    timer: $('[data-timer]'),
    fps: $('[data-fps]'),
    combo: $('[data-combo]'),
  };

  const shells = [];
  const lives = [];
  const previous = { points: -1, level: -1, lives: -1, ammo: -1, maxAmmo: -1, progress: -1 };
  const pointerPixels = { x: innerWidth / 2, y: innerHeight / 2 };
  let comboTimer = 0;

  const buildLives = (count) => {
    while (lives.length < count) {
      const dot = document.createElement('span');
      dot.className = 'hud__life';
      nodes.lives.appendChild(dot);
      lives.push(dot);
    }
  };

  const buildShells = (count) => {
    const target = Math.min(count, MAX_SHELL_ICONS);
    while (shells.length < target) {
      const shell = document.createElement('span');
      shell.className = 'hud__shell';
      nodes.ammo.appendChild(shell);
      shells.push(shell);
    }
    shells.forEach((shell, i) => (shell.style.display = i < target ? '' : 'none'));
  };

  const update = (data) => {
    if (data.points !== previous.points) {
      nodes.points.textContent = data.points.toLocaleString('pt-BR');
      previous.points = data.points;
    }
    if (data.level !== previous.level) {
      nodes.level.textContent = data.level;
      previous.level = data.level;
    }

    nodes.multiplier.textContent = `x${data.multiplier.toFixed(2).replace(/\.?0+$/, '')}`;

    if (data.lives !== previous.lives) {
      buildLives(3);
      lives.forEach((dot, i) => (dot.dataset.lost = String(i >= data.lives)));
      previous.lives = data.lives;
    }

    if (data.maxAmmo !== previous.maxAmmo) {
      buildShells(data.maxAmmo);
      previous.maxAmmo = data.maxAmmo;
    }
    if (data.ammo !== previous.ammo) {
      const spent = Math.min(data.maxAmmo, MAX_SHELL_ICONS) - Math.min(data.ammo, MAX_SHELL_ICONS);
      shells.forEach((shell, i) => (shell.dataset.spent = String(i < spent)));
      nodes.ammoCount.textContent = data.ammo;
      previous.ammo = data.ammo;
    }

    if (data.progress !== previous.progress) {
      nodes.progressFill.style.width = `${data.progress}%`;
      // Mesma escala de cor do original: vermelho → âmbar em 80% → verde em 90%
      nodes.progressFill.style.background =
        data.progress >= 90 ? 'var(--ok)' : data.progress >= 80 ? 'var(--accent)' : 'var(--danger)';
      nodes.progressLabel.textContent = `${data.progress}% abatidos`;
      previous.progress = data.progress;
    }

    nodes.timer.textContent = `${Math.max(0, data.timeLeft).toFixed(1)}s`;
  };

  const showCombo = (count, gained) => {
    nodes.combo.textContent = `COMBO ${count}!  +${gained}`;
    nodes.combo.style.left = `${pointerPixels.x}px`;
    nodes.combo.style.top = `${pointerPixels.y}px`;
    nodes.combo.dataset.active = 'false';
    // Reinicia a animação sem recriar o nó
    void nodes.combo.offsetWidth;
    nodes.combo.dataset.active = 'true';
    comboTimer = 0.9;
  };

  const flashHit = () => {
    crosshair.dataset.hit = 'false';
    void crosshair.offsetWidth;
    crosshair.dataset.hit = 'true';
  };

  events.on('hud:update', update);
  events.on('combo', ({ count, gained }) => showCombo(count, gained));
  events.on('shot:fired', ({ killed }) => killed > 0 && flashHit());

  const setVisible = (visible) => {
    hud.dataset.visible = String(visible);
    crosshair.dataset.visible = String(visible);
  };

  const applyDebug = () => {
    nodes.fps.dataset.visible = String(settings.get('debug'));
  };
  applyDebug();
  settings.on('change:debug', applyDebug);

  return {
    setVisible,
    /** `pointer` em NDC — convertido para pixels para mira e popup de combo. */
    setPointer: (pointer) => {
      pointerPixels.x = ((pointer.x + 1) / 2) * innerWidth;
      pointerPixels.y = ((1 - pointer.y) / 2) * innerHeight;
      crosshair.style.transform = `translate(${pointerPixels.x}px, ${pointerPixels.y}px)`;
    },
    tick: (dt, fps) => {
      if (settings.get('debug')) nodes.fps.textContent = `${fps} FPS`;
      if (comboTimer > 0) comboTimer = clamp(comboTimer - dt, 0, 1);
    },
    dispose: () => container.remove(),
  };
};
