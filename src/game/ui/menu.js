import { settings, QUALITY_PRESETS } from '../../core/settings.js';
import { MODE_LIST } from '../modes.js';
import { WEATHER } from '../../world/weather.js';

const template = /* html */ `
  <div class="loader" data-loader>
    <div>
      <div class="loader__bar"><div class="loader__fill" data-loader-fill></div></div>
      <p class="loader__text" data-loader-text>Montando o campo…</p>
    </div>
  </div>

  <div class="overlay" data-overlay="start">
    <div class="card">
      <h1 class="card__title">DUCK HUNT 3D</h1>
      <p class="card__subtitle">Remake em Three.js — mesma caçada, outro mundo.</p>

      <div class="mode">
        <button class="btn btn--icon" data-mode-prev aria-label="Modo anterior">‹</button>
        <div class="mode__info">
          <div class="mode__name" data-mode-name></div>
          <div class="mode__desc" data-mode-desc></div>
          <div class="mode__stats" data-mode-stats></div>
        </div>
        <button class="btn btn--icon" data-mode-next aria-label="Próximo modo">›</button>
      </div>

      <button class="btn btn--primary" data-play>Começar caçada</button>
      <button class="btn btn--ghost" data-open-settings>Configurações</button>
      <p class="card__subtitle" style="margin: 18px 0 0; text-align: center;">
        Recorde: <b data-best>0</b>
      </p>
    </div>
  </div>

  <div class="overlay" data-overlay="settings">
    <div class="card">
      <h1 class="card__title">Configurações</h1>
      <p class="card__subtitle">Ajustes salvos automaticamente neste navegador.</p>

      <div class="settings">
        <div class="field">
          <span class="field__label">Qualidade</span>
          <div class="segmented" data-quality></div>
        </div>

        <div class="field">
          <span class="field__label">Clima</span>
          <div class="segmented" data-weather></div>
        </div>

        <div class="field">
          <span class="field__label">Volume geral <b data-volume-value></b></span>
          <input type="range" min="0" max="1" step="0.05" data-volume />
        </div>

        <div class="field">
          <span class="field__label">Ambiente <b data-ambience-value></b></span>
          <input type="range" min="0" max="1" step="0.05" data-ambience />
        </div>

        <div class="field">
          <span class="field__label">Sensibilidade <b data-sensitivity-value></b></span>
          <input type="range" min="0.3" max="2" step="0.05" data-sensitivity />
        </div>

        <div class="field">
          <span class="field__label">Extras</span>
          <div class="segmented">
            <button data-fullscreen>Tela cheia</button>
            <button data-debug>Debug / FPS</button>
          </div>
        </div>
      </div>

      <button class="btn btn--primary" data-close-settings>Voltar</button>
    </div>
  </div>

  <div class="overlay" data-overlay="gameover">
    <div class="card">
      <h1 class="card__title">Fim de jogo</h1>
      <p class="card__subtitle" data-gameover-note></p>

      <div class="summary">
        <div class="summary__item">
          <div class="summary__label">Pontos</div>
          <div class="summary__value" data-sum-points>0</div>
        </div>
        <div class="summary__item">
          <div class="summary__label">Rodadas</div>
          <div class="summary__value" data-sum-level>0</div>
        </div>
        <div class="summary__item">
          <div class="summary__label">Acertos</div>
          <div class="summary__value" data-sum-hits>0</div>
        </div>
        <div class="summary__item">
          <div class="summary__label">Precisão</div>
          <div class="summary__value" data-sum-accuracy>0%</div>
        </div>
      </div>

      <button class="btn btn--primary" data-replay>Jogar de novo</button>
      <button class="btn btn--ghost" data-back-menu>Menu principal</button>
    </div>
  </div>
`;

/** Menu, configurações e tela final. Toda a interface fora do jogo vive aqui. */
export const createMenu = ({ root, events, onStart, onWeatherChange }) => {
  const container = document.createElement('div');
  container.innerHTML = template;
  root.appendChild(container);

  const $ = (selector) => container.querySelector(selector);
  const $$ = (selector) => [...container.querySelectorAll(selector)];

  const overlays = {
    start: $('[data-overlay="start"]'),
    settings: $('[data-overlay="settings"]'),
    gameover: $('[data-overlay="gameover"]'),
  };
  const loader = $('[data-loader]');
  let modeIndex = 0;

  const openOverlay = (name) => {
    Object.entries(overlays).forEach(([key, el]) => (el.dataset.open = String(key === name)));
  };

  const closeAll = () => Object.values(overlays).forEach((el) => (el.dataset.open = 'false'));

  // ---------- Carrossel de modos (mesma navegação do StartScreen original) ----------
  const renderMode = () => {
    const mode = MODE_LIST[modeIndex];
    $('[data-mode-name]').textContent = mode.name;
    $('[data-mode-desc]').textContent = mode.description;
    $('[data-mode-stats]').innerHTML = `
      <span>Patos <b>${mode.ducks}</b></span>
      <span>Munição <b>${mode.ammo}</b></span>
      <span>Tempo <b>${mode.moves}s</b></span>
    `;
  };

  const cycleMode = (step) => {
    modeIndex = (modeIndex + step + MODE_LIST.length) % MODE_LIST.length;
    renderMode();
  };

  $('[data-mode-prev]').addEventListener('click', () => cycleMode(-1));
  $('[data-mode-next]').addEventListener('click', () => cycleMode(1));
  $('[data-play]').addEventListener('click', () => {
    const mode = MODE_LIST[modeIndex];
    settings.set('weather', mode.weather);
    closeAll();
    onStart(mode.id);
  });

  // ---------- Configurações ----------
  const buildSegmented = (selector, entries, getCurrent, onPick) => {
    const host = $(selector);
    host.innerHTML = '';
    entries.forEach(([key, label]) => {
      const button = document.createElement('button');
      button.textContent = label;
      button.dataset.key = key;
      button.addEventListener('click', () => {
        onPick(key);
        sync();
      });
      host.appendChild(button);
    });
    const sync = () =>
      [...host.children].forEach((btn) => (btn.dataset.active = String(btn.dataset.key === getCurrent())));
    sync();
    return sync;
  };

  const syncQuality = buildSegmented(
    '[data-quality]',
    [['auto', 'Auto'], ...Object.entries(QUALITY_PRESETS).map(([key, p]) => [key, p.label])],
    () => settings.get('quality'),
    (key) => settings.set('quality', key),
  );

  const syncWeather = buildSegmented(
    '[data-weather]',
    Object.entries(WEATHER).map(([key, w]) => [key, w.label]),
    () => settings.get('weather'),
    (key) => {
      settings.set('weather', key);
      onWeatherChange?.(key);
    },
  );

  const sliders = [
    ['[data-volume]', '[data-volume-value]', 'masterVolume', (v) => `${Math.round(v * 100)}%`],
    ['[data-ambience]', '[data-ambience-value]', 'ambienceVolume', (v) => `${Math.round(v * 100)}%`],
    ['[data-sensitivity]', '[data-sensitivity-value]', 'sensitivity', (v) => `${v.toFixed(2)}x`],
  ];
  sliders.forEach(([inputSel, labelSel, key, format]) => {
    const input = $(inputSel);
    const label = $(labelSel);
    input.value = settings.get(key);
    label.textContent = format(settings.get(key));
    input.addEventListener('input', () => {
      const value = Number(input.value);
      settings.set(key, value);
      label.textContent = format(value);
    });
  });

  $('[data-fullscreen]').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  });

  const debugButton = $('[data-debug]');
  const syncDebug = () => (debugButton.dataset.active = String(settings.get('debug')));
  debugButton.addEventListener('click', () => {
    settings.set('debug', !settings.get('debug'));
    syncDebug();
  });
  syncDebug();

  $('[data-open-settings]').addEventListener('click', () => openOverlay('settings'));
  $('[data-close-settings]').addEventListener('click', () => openOverlay('start'));

  // ---------- Fim de jogo ----------
  $('[data-replay]').addEventListener('click', () => {
    closeAll();
    onStart(MODE_LIST[modeIndex].id);
  });
  $('[data-back-menu]').addEventListener('click', () => showStart());

  const showStart = () => {
    $('[data-best]').textContent = Number(localStorage.getItem('duckhunt3d.best') ?? 0).toLocaleString('pt-BR');
    syncQuality();
    syncWeather();
    renderMode();
    openOverlay('start');
  };

  const showGameOver = (stats) => {
    $('[data-sum-points]').textContent = stats.points.toLocaleString('pt-BR');
    $('[data-sum-level]').textContent = stats.level;
    $('[data-sum-hits]').textContent = stats.hits;
    $('[data-sum-accuracy]').textContent = `${stats.accuracy}%`;
    $('[data-gameover-note]').textContent =
      stats.points >= stats.best && stats.points > 0
        ? `Novo recorde: ${stats.points.toLocaleString('pt-BR')} pontos.`
        : `Recorde atual: ${stats.best.toLocaleString('pt-BR')} pontos.`;
    openOverlay('gameover');
  };

  events.on('game:over', showGameOver);

  renderMode();

  return {
    showStart,
    showGameOver,
    closeAll,
    setProgress: (t) => {
      $('[data-loader-fill]').style.width = `${Math.round(t * 100)}%`;
    },
    setLoadingText: (text) => {
      $('[data-loader-text]').textContent = text;
    },
    finishLoading: () => {
      loader.dataset.done = 'true';
      setTimeout(() => loader.remove(), 600);
    },
    get isOpen() {
      return Object.values(overlays).some((el) => el.dataset.open === 'true');
    },
    dispose: () => container.remove(),
  };
};
