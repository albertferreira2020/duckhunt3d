import { Vector3, Color, MathUtils } from 'three';

const dirFrom = (elevationDeg, azimuthDeg) => {
  const phi = MathUtils.degToRad(90 - elevationDeg);
  const theta = MathUtils.degToRad(azimuthDeg);
  return new Vector3().setFromSphericalCoords(1, phi, theta);
};

/**
 * Presets climáticos. Cada um descreve céu, sol, névoa e partículas de chuva;
 * tudo o mais (lights, env map, fog) deriva daqui — é o único lugar a editar
 * para acrescentar um clima novo.
 */
export const WEATHER = {
  clear: {
    label: 'Céu limpo',
    sunDirection: dirFrom(52, 128),
    sunColor: new Color('#fff2d5'),
    sunIntensity: 3.1,
    ambientColor: new Color('#9fc4e8'),
    ambientIntensity: 0.42,
    hemiSky: new Color('#8fc4ff'),
    hemiGround: new Color('#5d7a44'),
    hemiIntensity: 0.85,
    zenith: new Color('#1d5fc4'),
    horizon: new Color('#c4dcf2'),
    cloudCoverage: 0.48,
    cloudDensity: 0.95,
    cloudColor: new Color('#ffffff'),
    cloudShadow: new Color('#9db4cc'),
    fogColor: new Color('#c2d8ea'),
    fogDensity: 0.0016,
    exposure: 1.05,
    rain: 0,
  },
  sunset: {
    label: 'Fim de tarde',
    sunDirection: dirFrom(7, 96),
    sunColor: new Color('#ff9a4d'),
    sunIntensity: 2.6,
    ambientColor: new Color('#5a4a78'),
    ambientIntensity: 0.4,
    hemiSky: new Color('#ff9e6b'),
    hemiGround: new Color('#3a2f2a'),
    hemiIntensity: 0.7,
    zenith: new Color('#1b3168'),
    horizon: new Color('#ff9b5e'),
    cloudCoverage: 0.5,
    cloudDensity: 0.95,
    cloudColor: new Color('#ffc79a'),
    cloudShadow: new Color('#6b4a62'),
    fogColor: new Color('#e39a68'),
    fogDensity: 0.0026,
    exposure: 1.0,
    rain: 0,
  },
  overcast: {
    label: 'Nublado',
    sunDirection: dirFrom(38, 150),
    sunColor: new Color('#c8d2dc'),
    sunIntensity: 1.15,
    ambientColor: new Color('#aab6c2'),
    ambientIntensity: 0.75,
    hemiSky: new Color('#b9c6d2'),
    hemiGround: new Color('#4e5a48'),
    hemiIntensity: 1.05,
    zenith: new Color('#7d8fa3'),
    horizon: new Color('#b9c5d0'),
    cloudCoverage: 0.82,
    cloudDensity: 1.0,
    cloudColor: new Color('#d4dce4'),
    cloudShadow: new Color('#7b8794'),
    fogColor: new Color('#b3bfca'),
    fogDensity: 0.0042,
    exposure: 1.0,
    rain: 0,
  },
  rain: {
    label: 'Chuva leve',
    sunDirection: dirFrom(30, 160),
    sunColor: new Color('#a9b6c4'),
    sunIntensity: 0.8,
    ambientColor: new Color('#8e9aa8'),
    ambientIntensity: 0.8,
    hemiSky: new Color('#9aa8b6'),
    hemiGround: new Color('#41503e'),
    hemiIntensity: 1.0,
    zenith: new Color('#5d6d7e'),
    horizon: new Color('#95a3b0'),
    cloudCoverage: 0.92,
    cloudDensity: 1.0,
    cloudColor: new Color('#a9b4bf'),
    cloudShadow: new Color('#5c6771'),
    fogColor: new Color('#93a0ac'),
    fogDensity: 0.0062,
    exposure: 0.95,
    rain: 1,
  },
};

export const WEATHER_KEYS = Object.keys(WEATHER);
