import { Mesh, SphereGeometry, ShaderMaterial, BackSide, Vector3, Color } from 'three';

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  varying vec3 vDir;

  uniform vec3  uSunDirection;
  uniform vec3  uSunColor;
  uniform vec3  uZenithColor;
  uniform vec3  uHorizonColor;
  uniform vec3  uGroundColor;
  uniform vec3  uCloudColor;
  uniform vec3  uCloudShadowColor;
  uniform float uCloudCoverage;
  uniform float uCloudDensity;
  uniform float uSunIntensity;
  uniform float uTime;

  // Value noise + fbm: barato o bastante para rodar full-screen no domo
  float hash(vec2 p) {
    p = fract(p * vec2(233.34, 851.73));
    p += dot(p, p + 23.45);
    return fract(p.x * p.y);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(vec2 p) {
    float sum = 0.0;
    float amp = 0.5;
    mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 5; i++) {
      sum += amp * valueNoise(p);
      p = rot * p * 2.03;
      amp *= 0.5;
    }
    return sum;
  }

  void main() {
    vec3 dir = normalize(vDir);
    float h = dir.y;

    // Gradiente base zênite -> horizonte -> solo
    float skyMix = pow(clamp(h, 0.0, 1.0), 0.42);
    vec3 color = mix(uHorizonColor, uZenithColor, skyMix);
    color = mix(color, uGroundColor, smoothstep(0.0, -0.12, h));

    // Sol: disco + halo + espalhamento largo no horizonte
    float sunDot = max(dot(dir, uSunDirection), 0.0);
    float disc = smoothstep(0.9987, 0.9996, sunDot);
    float halo = pow(sunDot, 620.0) * 0.7 + pow(sunDot, 34.0) * 0.28;
    float scatter = pow(sunDot, 5.0) * 0.16;
    color += uSunColor * (disc * 9.0 + halo * uSunIntensity + scatter);

    // Nuvens: dois estratos projetados num plano acima do observador
    if (h > 0.006) {
      vec2 base = dir.xz / max(h, 0.045);
      vec2 windA = vec2(uTime * 0.0075, uTime * 0.0032);
      vec2 windB = vec2(uTime * 0.0138, -uTime * 0.0051);

      float lower = fbm(base * 0.85 + windA);
      float upper = fbm(base * 1.9 + windB + 31.7);
      float mass = lower * 0.68 + upper * 0.32;

      float shape = smoothstep(1.0 - uCloudCoverage, 1.0 - uCloudCoverage + 0.28, mass);
      float fade = smoothstep(0.0, 0.16, h);           // some no horizonte
      float alpha = clamp(shape * uCloudDensity * fade, 0.0, 1.0);

      // Iluminação fake: bordas voltadas ao sol ficam quentes, núcleo fica frio
      float lightSide = clamp(dot(normalize(vec3(dir.x, 0.28, dir.z)), uSunDirection), 0.0, 1.0);
      float thickness = smoothstep(0.15, 0.95, mass);
      vec3 cloud = mix(uCloudColor, uCloudShadowColor, thickness * 0.85);
      cloud += uSunColor * pow(lightSide, 3.0) * (1.0 - thickness) * 0.55;

      color = mix(color, cloud, alpha);
    }

    // Dither leve elimina banding no gradiente
    color += (hash(gl_FragCoord.xy) - 0.5) * 0.0035;

    gl_FragColor = vec4(color, 1.0);
  }
`;

export const createSky = ({ radius = 700 } = {}) => {
  const uniforms = {
    uSunDirection: { value: new Vector3(0.4, 0.5, -0.76).normalize() },
    uSunColor: { value: new Color('#ffd9a0') },
    uZenithColor: { value: new Color('#2b6ec8') },
    uHorizonColor: { value: new Color('#bcd8f0') },
    uGroundColor: { value: new Color('#5b6a58') },
    uCloudColor: { value: new Color('#ffffff') },
    uCloudShadowColor: { value: new Color('#8fa3bb') },
    uCloudCoverage: { value: 0.42 },
    uCloudDensity: { value: 0.9 },
    uSunIntensity: { value: 1 },
    uTime: { value: 0 },
  };

  const material = new ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    side: BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: true,
  });

  const mesh = new Mesh(new SphereGeometry(radius, 48, 32), material);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.matrixAutoUpdate = false;

  return {
    mesh,
    uniforms,
    update: (elapsed) => {
      uniforms.uTime.value = elapsed;
    },
    dispose: () => {
      mesh.geometry.dispose();
      material.dispose();
    },
  };
};
