/**
 * Vento compartilhado. Um único par de uniforms alimenta grama, folhagem e flores,
 * então tudo balança em fase — é o que faz o campo parecer um sistema só.
 */
export const windUniforms = {
  uTime: { value: 0 },
  uWindStrength: { value: 1 },
  uWindDirection: { value: [0.82, 0.57] },
};

export const updateWind = (elapsed) => {
  windUniforms.uTime.value = elapsed;
};

/**
 * Injeta deslocamento de vento em qualquer MeshStandardMaterial.
 * `mask` é uma expressão GLSL que devolve 0..1 (quanto o vértice é afetado).
 */
export const applyWind = (material, { strength = 1, mask = 'pow(uv.y, 1.7)', instanced = true } = {}) => {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWindStrength = windUniforms.uWindStrength;
    shader.uniforms.uWindDirection = windUniforms.uWindDirection;
    shader.uniforms.uLocalStrength = { value: strength };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        uniform float uTime;
        uniform float uWindStrength;
        uniform vec2  uWindDirection;
        uniform float uLocalStrength;
      `,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        {
          vec3 anchor = ${instanced ? 'instanceMatrix[3].xyz' : 'modelMatrix[3].xyz'};
          float phase = anchor.x * 0.23 + anchor.z * 0.31;

          // Rajada de baixa frequência modulando duas ondas rápidas
          float gust = 0.62 + 0.38 * sin(uTime * 0.31 + anchor.x * 0.018 + anchor.z * 0.013);
          float sway = sin(uTime * 1.7 + phase) * 0.6 + sin(uTime * 3.3 + phase * 1.6) * 0.28;

          float mask = ${mask};
          float amount = sway * gust * mask * uWindStrength * uLocalStrength;

          transformed.x += uWindDirection.x * amount;
          transformed.z += uWindDirection.y * amount;
          transformed.y -= abs(amount) * 0.18 * mask;
        }
      `,
      );
  };
  material.customProgramCacheKey = () => `wind-${strength}-${mask}-${instanced}`;
  return material;
};
