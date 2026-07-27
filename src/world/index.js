import { Group } from 'three';
import { createTerrain } from './terrain.js';
import { createGrass } from './grass.js';
import { createScatter } from './scatter.js';
import { createWater } from './water.js';
import { createFence } from './fence.js';
import { createMountains } from './mountains.js';
import { createRain } from './rain.js';
import { updateWind, windUniforms } from './wind.js';
import { settings } from '../core/settings.js';

/** Monta o cenário inteiro e expõe um único `update` para o loop. */
export const createWorld = (scene) => {
  const root = new Group();
  root.name = 'world';

  const terrain = createTerrain();
  const grass = createGrass();
  const scatter = createScatter();
  const water = createWater();
  const fence = createFence();
  const mountains = createMountains();
  const rain = createRain({ count: settings.preset.tier >= 2 ? 4200 : 2000 });

  root.add(terrain.mesh, scatter.group, water.mesh, fence.group, mountains.mesh, rain.mesh);
  if (grass.mesh) root.add(grass.mesh);
  scene.add(root);

  return {
    root,
    /** Vento mais forte no clima chuvoso; a chuva só aparece no preset `rain`. */
    applyWeather: (preset) => {
      rain.setIntensity(preset.rain);
      windUniforms.uWindStrength.value = preset.rain > 0 ? 2.1 : 1;
    },
    update: (dt, elapsed, camera) => {
      updateWind(elapsed);
      water.update(elapsed);
      rain.update(elapsed, camera);
    },
    dispose: () => {
      [terrain, grass, scatter, water, fence, mountains, rain].forEach((m) => m.dispose());
      scene.remove(root);
    },
  };
};
