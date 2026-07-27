import { AudioListener, Audio, PositionalAudio, Object3D, Vector3 } from 'three';
import { settings } from '../core/settings.js';
import { randRange, clamp, TAU } from '../utils/math.js';

/** Filtro de um polo — molda ruído branco sem precisar de nós extras no grafo. */
const lowpass = (data, cutoff) => {
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    last += (data[i] - last) * cutoff;
    data[i] = last;
  }
};

const highpass = (data, cutoff) => {
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const current = data[i];
    last += (current - last) * cutoff;
    data[i] = current - last;
  }
};

/** O sample rate vem do AudioContext — varia por navegador/dispositivo (24k, 44.1k, 48k). */
const makeBuffer = (ctx, seconds, fill) => {
  const sr = ctx.sampleRate;
  const length = Math.max(1, Math.floor(seconds * sr));
  const buffer = ctx.createBuffer(1, length, sr);
  const data = buffer.getChannelData(0);
  fill(data, length, sr);
  return buffer;
};

const envelope = (i, length, attack, decay) => {
  const t = i / length;
  const a = attack > 0 ? Math.min(1, t / attack) : 1;
  const d = Math.exp(-t / decay);
  return a * d;
};

/**
 * Banco de sons sintetizado em runtime.
 * Nenhum arquivo de áudio: cada efeito é gerado por DSP direto no buffer, o que
 * mantém o jogo com zero assets binários e permite variar tom/duração por chamada.
 */
const buildBuffers = (ctx) => ({
  // Tiro: estouro de ruído filtrado + "thump" grave do cano
  shot: makeBuffer(ctx, 0.55, (data, n, sr) => {
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * envelope(i, n, 0.001, 0.09);
    lowpass(data, 0.42);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      data[i] += Math.sin(TAU * (90 - t * 60) * t) * Math.exp(-t * 16) * 0.85;
      data[i] = Math.tanh(data[i] * 1.7) * 0.85;
    }
  }),

  // Percussor sem munição
  empty: makeBuffer(ctx, 0.12, (data, n, sr) => {
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * envelope(i, n, 0.0005, 0.012);
    highpass(data, 0.6);
  }),

  // Bombeamento: dois cliques metálicos
  pump: makeBuffer(ctx, 0.32, (data, n, sr) => {
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const clickA = Math.exp(-((t - 0.02) ** 2) / 0.00002);
      const clickB = Math.exp(-((t - 0.17) ** 2) / 0.00003);
      data[i] = (Math.random() * 2 - 1) * (clickA + clickB) * 0.9;
    }
    highpass(data, 0.45);
  }),

  // Grasnado: serra com vibrato e duas sílabas
  quack: makeBuffer(ctx, 0.34, (data, n, sr) => {
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const syllable = t < 0.13 ? 1 : t < 0.17 ? 0 : 0.8;
      const freq = 300 + Math.sin(t * 58) * 55 - t * 120;
      phase += (TAU * freq) / sr;
      const saw = 2 * (phase / TAU - Math.floor(0.5 + phase / TAU));
      data[i] = saw * envelope(i, n, 0.02, 0.32) * syllable * 0.7;
    }
    lowpass(data, 0.55);
  }),

  // Pato caindo: sirene descendente
  fall: makeBuffer(ctx, 0.75, (data, n, sr) => {
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const freq = 900 * (1 - t) + 120;
      phase += (TAU * freq) / sr;
      data[i] = Math.sin(phase) * (1 - t) * 0.5;
    }
  }),

  // Impacto no chão
  thud: makeBuffer(ctx, 0.3, (data, n, sr) => {
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      data[i] =
        (Math.random() * 2 - 1) * envelope(i, n, 0.001, 0.04) * 0.6 +
        Math.sin(TAU * 70 * t) * Math.exp(-t * 22) * 0.6;
    }
    lowpass(data, 0.3);
  }),

  // Latido
  bark: makeBuffer(ctx, 0.28, (data, n, sr) => {
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const freq = 220 + Math.exp(-t * 30) * 340;
      phase += (TAU * freq) / sr;
      const saw = 2 * (phase / TAU - Math.floor(0.5 + phase / TAU));
      data[i] = (saw * 0.7 + (Math.random() * 2 - 1) * 0.3) * envelope(i, n, 0.01, 0.07);
    }
    lowpass(data, 0.5);
  }),

  // Risada do cão: sequência de latidos curtos em tom subindo
  laugh: makeBuffer(ctx, 1.1, (data, n, sr) => {
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const beat = Math.max(0, Math.sin(t * 34));
      const freq = 260 + Math.sin(t * 5) * 60 + t * 90;
      phase += (TAU * freq) / sr;
      const saw = 2 * (phase / TAU - Math.floor(0.5 + phase / TAU));
      data[i] = saw * beat * beat * Math.exp(-t * 1.4) * 0.55;
    }
    lowpass(data, 0.55);
  }),

  // Canto de pássaro para o ambiente
  chirp: makeBuffer(ctx, 0.22, (data, n, sr) => {
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const freq = 2600 + Math.sin(t * 42) * 900 + t * 1400;
      phase += (TAU * freq) / sr;
      data[i] = Math.sin(phase) * envelope(i, n, 0.08, 0.18) * 0.32;
    }
  }),

  // Vento: ruído rosa-ish com modulação lenta, feito para loopar
  wind: makeBuffer(ctx, 6, (data, n, sr) => {
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    lowpass(data, 0.02);
    lowpass(data, 0.05);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      data[i] *= 5.5 * (0.55 + 0.45 * Math.sin(t * 0.7) * Math.sin(t * 0.23));
      // Crossfade nas pontas para o loop não estalar
      const edge = Math.min(1, Math.min(i, n - i) / (sr * 0.4));
      data[i] *= edge;
    }
  }),

  // Ponto de pontuação / combo
  ding: makeBuffer(ctx, 0.5, (data, n, sr) => {
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      data[i] =
        (Math.sin(TAU * 988 * t) * 0.5 + Math.sin(TAU * 1319 * t) * 0.3) * Math.exp(-t * 7) * 0.5;
    }
  }),
});

/** Impulso de reverb curto — o "eco ambiente" do campo aberto. */
const buildReverb = (ctx) => {
  const sr = ctx.sampleRate;
  const length = Math.floor(sr * 1.8);
  const impulse = ctx.createBuffer(2, length, sr);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.6);
    }
    lowpass(data, 0.25);
  }
  return impulse;
};

export const createAudio = ({ camera, scene }) => {
  const listener = new AudioListener();
  camera.add(listener);
  const ctx = listener.context;

  const buffers = buildBuffers(ctx);

  const reverb = ctx.createConvolver();
  reverb.buffer = buildReverb(ctx);
  const reverbGain = ctx.createGain();
  reverbGain.gain.value = 0.22;
  reverb.connect(reverbGain).connect(listener.getInput());

  // Pool de emissores posicionais: nenhum nó de áudio é criado durante o jogo
  const voices = Array.from({ length: 14 }, () => {
    const holder = new Object3D();
    const audio = new PositionalAudio(listener);
    audio.setRefDistance(9);
    audio.setRolloffFactor(1.1);
    audio.setDistanceModel('exponential');
    holder.add(audio);
    scene.add(holder);
    return { holder, audio };
  });
  let voiceIndex = 0;

  const flat = Array.from({ length: 6 }, () => new Audio(listener));

  const ambience = { wind: new Audio(listener), started: false, chirpTimer: 0 };
  ambience.wind.setBuffer(buffers.wind);
  ambience.wind.setLoop(true);

  const applyVolumes = () => {
    listener.setMasterVolume(settings.get('masterVolume'));
    ambience.wind.setVolume(settings.get('ambienceVolume') * 0.7);
  };
  applyVolumes();
  settings.on('change:masterVolume', applyVolumes);
  settings.on('change:ambienceVolume', applyVolumes);

  const resume = () => {
    if (ctx.state === 'suspended') ctx.resume();
  };

  const playAt = (name, position, { volume = 1, rate = 1, reverbSend = 0.3 } = {}) => {
    const buffer = buffers[name];
    if (!buffer || ctx.state !== 'running') return;

    const voice = voices[voiceIndex];
    voiceIndex = (voiceIndex + 1) % voices.length;

    if (voice.audio.isPlaying) voice.audio.stop();
    voice.holder.position.copy(position);
    voice.audio.setBuffer(buffer);
    voice.audio.setPlaybackRate(rate);
    voice.audio.setVolume(volume * settings.get('sfxVolume'));
    // Envio ao reverb via o próprio ganho do emissor — mistura simples e barata
    voice.audio.getOutput().connect(reverb);
    reverbGain.gain.value = 0.22 * reverbSend + 0.05;
    voice.audio.play();
  };

  const play = (name, { volume = 1, rate = 1 } = {}) => {
    const buffer = buffers[name];
    if (!buffer || ctx.state !== 'running') return;
    const audio = flat.find((a) => !a.isPlaying) ?? flat[0];
    if (audio.isPlaying) audio.stop();
    audio.setBuffer(buffer);
    audio.setPlaybackRate(rate);
    audio.setVolume(volume * settings.get('sfxVolume'));
    audio.play();
  };

  const startAmbience = () => {
    resume();
    if (ambience.started || ctx.state !== 'running') return;
    ambience.wind.play();
    ambience.started = true;
  };

  const stopAmbience = () => {
    if (!ambience.started) return;
    ambience.wind.stop();
    ambience.started = false;
  };

  const chirpPosition = new Vector3();

  /** Pássaros esporádicos ao redor — vida no cenário sem trilha sonora. */
  const update = (dt) => {
    if (!ambience.started) return;
    ambience.chirpTimer -= dt;
    if (ambience.chirpTimer > 0) return;
    ambience.chirpTimer = randRange(2.4, 7);
    chirpPosition.set(randRange(-50, 50), randRange(6, 16), randRange(-60, -10));
    playAt('chirp', chirpPosition, {
      volume: randRange(0.2, 0.5) * settings.get('ambienceVolume'),
      rate: randRange(0.85, 1.3),
      reverbSend: 0.8,
    });
  };

  return {
    listener,
    play,
    playAt,
    startAmbience,
    stopAmbience,
    resume,
    update,
    setWind: (intensity) => ambience.wind.setVolume(clamp(intensity, 0, 1) * settings.get('ambienceVolume')),
    dispose: () => {
      stopAmbience();
      voices.forEach((v) => {
        if (v.audio.isPlaying) v.audio.stop();
        scene.remove(v.holder);
      });
      camera.remove(listener);
    },
  };
};
