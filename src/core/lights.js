import { DirectionalLight, AmbientLight, HemisphereLight, Object3D, Vector3 } from 'three';
import { settings } from './settings.js';

const SHADOW_EXTENT = 78;
const SUN_DISTANCE = 160;

export const createLights = (scene) => {
  const sun = new DirectionalLight(0xffffff, 3);
  const sunTarget = new Object3D();
  sunTarget.position.set(0, 8, -12);
  sun.target = sunTarget;

  sun.castShadow = true;
  sun.shadow.camera.left = -SHADOW_EXTENT;
  sun.shadow.camera.right = SHADOW_EXTENT;
  sun.shadow.camera.top = SHADOW_EXTENT;
  sun.shadow.camera.bottom = -SHADOW_EXTENT;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 400;
  sun.shadow.bias = -0.0007;
  sun.shadow.normalBias = 0.05;
  sun.shadow.radius = 3;

  const ambient = new AmbientLight(0xffffff, 0.4);
  const hemisphere = new HemisphereLight(0xffffff, 0xffffff, 0.8);
  hemisphere.position.set(0, 60, 0);

  scene.add(sun, sunTarget, ambient, hemisphere);

  const applyShadowResolution = () => {
    const size = settings.preset.shadowMapSize;
    if (sun.shadow.mapSize.width === size) return;
    sun.shadow.mapSize.setScalar(size);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  };
  applyShadowResolution();
  settings.on('change:quality', applyShadowResolution);

  const tmp = new Vector3();

  const applyWeather = (preset) => {
    tmp.copy(preset.sunDirection).multiplyScalar(SUN_DISTANCE);
    sun.position.copy(tmp).add(sunTarget.position);
    sun.color.copy(preset.sunColor);
    sun.intensity = preset.sunIntensity;

    ambient.color.copy(preset.ambientColor);
    ambient.intensity = preset.ambientIntensity;

    hemisphere.color.copy(preset.hemiSky);
    hemisphere.groundColor.copy(preset.hemiGround);
    hemisphere.intensity = preset.hemiIntensity;
  };

  return { sun, ambient, hemisphere, applyWeather };
};
