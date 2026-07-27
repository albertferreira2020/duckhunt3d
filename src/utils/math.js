export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);

export const lerp = (a, b, t) => a + (b - a) * t;

/** Interpolação exponencial independente de framerate. */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

export const smoothstep = (t) => t * t * (3 - 2 * t);

export const randRange = (min, max) => min + Math.random() * (max - min);

export const randInt = (min, max) => Math.floor(randRange(min, max + 1));

export const pick = (arr) => arr[(Math.random() * arr.length) | 0];

export const TAU = Math.PI * 2;

/** Bézier cúbica escalar — base das trajetórias curvas dos patos. */
export const cubicBezier = (p0, p1, p2, p3, t) => {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
};

/** Escreve a Bézier cúbica em `out` (Vector3), sem alocar. */
export const cubicBezierVec = (out, p0, p1, p2, p3, t) => {
  out.set(
    cubicBezier(p0.x, p1.x, p2.x, p3.x, t),
    cubicBezier(p0.y, p1.y, p2.y, p3.y, t),
    cubicBezier(p0.z, p1.z, p2.z, p3.z, t),
  );
  return out;
};

/** Menor diferença angular com sinal, em (-PI, PI]. */
export const angleDelta = (from, to) => {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};
