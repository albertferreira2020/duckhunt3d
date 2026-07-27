/** Emissor mínimo — desacopla gameplay de HUD, áudio e partículas. */
export const createEmitter = () => {
  const listeners = new Map();

  const on = (type, fn) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
    return () => off(type, fn);
  };

  const off = (type, fn) => listeners.get(type)?.delete(fn);

  const emit = (type, payload) => {
    const set = listeners.get(type);
    if (!set) return;
    for (const fn of set) fn(payload);
  };

  return { on, off, emit, clear: () => listeners.clear() };
};
