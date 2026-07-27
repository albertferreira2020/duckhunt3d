import { Scene, FogExp2, PMREMGenerator } from 'three';
import { createSky } from '../world/sky.js';
import { createLights } from './lights.js';
import { WEATHER } from '../world/weather.js';
import { settings } from './settings.js';

/**
 * Cena + céu + luzes + environment map.
 *
 * O env map PBR vem do próprio domo procedural via PMREM: sem HDRI externo, mas com
 * reflexos e ambient coerentes com o clima ativo. Trocar o clima regenera o mapa.
 */
export const createEnvironment = () => {
  const scene = new Scene();
  scene.fog = new FogExp2(0xc2d8ea, 0.0016);

  const sky = createSky();
  scene.add(sky.mesh);

  const lights = createLights(scene);

  let pmrem = null;
  let envRT = null;
  let currentKey = null;

  const regenerateEnvMap = (renderer) => {
    if (!renderer) return;
    pmrem ??= new PMREMGenerator(renderer);
    const captureScene = new Scene();
    const skyClone = sky.mesh.clone();
    skyClone.material = sky.mesh.material; // compartilha uniforms já configurados
    captureScene.add(skyClone);

    envRT?.dispose();
    envRT = pmrem.fromScene(captureScene, 0, 1, 900);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 1;
    captureScene.clear();
  };

  const applyWeather = (key, renderer) => {
    const preset = WEATHER[key] ?? WEATHER.clear;
    currentKey = WEATHER[key] ? key : 'clear';

    const u = sky.uniforms;
    u.uSunDirection.value.copy(preset.sunDirection);
    u.uSunColor.value.copy(preset.sunColor);
    u.uZenithColor.value.copy(preset.zenith);
    u.uHorizonColor.value.copy(preset.horizon);
    u.uCloudCoverage.value = preset.cloudCoverage;
    u.uCloudDensity.value = preset.cloudDensity;
    u.uCloudColor.value.copy(preset.cloudColor);
    u.uCloudShadowColor.value.copy(preset.cloudShadow);
    u.uSunIntensity.value = preset.sunIntensity / 3;

    scene.fog.color.copy(preset.fogColor);
    scene.fog.density = preset.fogDensity;

    lights.applyWeather(preset);
    regenerateEnvMap(renderer);
    return preset;
  };

  return {
    scene,
    sky,
    lights,
    applyWeather,
    get weatherKey() {
      return currentKey;
    },
    get preset() {
      return WEATHER[currentKey ?? settings.get('weather')] ?? WEATHER.clear;
    },
    update: (elapsed) => sky.update(elapsed),
    dispose: () => {
      sky.dispose();
      envRT?.dispose();
      pmrem?.dispose();
    },
  };
};
