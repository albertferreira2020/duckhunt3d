import {
  WebGLRenderer,
  PCFSoftShadowMap,
  ACESFilmicToneMapping,
  SRGBColorSpace,
  Vector2,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { settings } from './settings.js';
import { clamp } from '../utils/math.js';

export const createRenderer = ({ canvas, scene, camera }) => {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: false, // SMAA cuida disso; MSAA + composer é desperdício
    powerPreference: 'high-performance',
    stencil: false,
  });

  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = true;

  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(new Vector2(1, 1), 0.42, 0.75, 0.85);
  const bokehPass = new BokehPass(scene, camera, { focus: 60, aperture: 0.00018, maxblur: 0.006 });
  const smaaPass = new SMAAPass();
  const outputPass = new OutputPass();

  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(bokehPass);
  composer.addPass(smaaPass);
  composer.addPass(outputPass);

  const applyPreset = () => {
    const p = settings.preset;
    renderer.setPixelRatio(clamp(window.devicePixelRatio, 1, p.pixelRatio));
    renderer.shadowMap.enabled = p.shadows;
    bloomPass.enabled = p.bloom;
    bokehPass.enabled = p.dof;
    smaaPass.enabled = p.smaa;
    // Recompila materiais que dependem de shadowMap.enabled
    scene.traverse((o) => {
      if (o.isMesh && o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => (m.needsUpdate = true));
      }
    });
  };

  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloomPass.setSize(w, h);
  };

  applyPreset();
  resize();
  window.addEventListener('resize', resize, { passive: true });
  settings.on('change:quality', applyPreset);

  /** Foco do DoF acompanha a distância do alvo mirado. */
  const setFocus = (distance) => {
    bokehPass.uniforms.focus.value = clamp(distance, 8, 300);
  };

  return {
    renderer,
    composer,
    resize,
    setFocus,
    render: () => composer.render(),
    dispose: () => {
      window.removeEventListener('resize', resize);
      composer.dispose();
      renderer.dispose();
    },
  };
};
