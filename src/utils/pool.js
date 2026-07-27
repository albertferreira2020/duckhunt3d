/**
 * Object pool genérico. Nada de `new` durante o gameplay — o GC é o inimigo do 60 FPS.
 */
export const createPool = (factory, { reset, initial = 0 } = {}) => {
  const free = [];
  const active = new Set();

  for (let i = 0; i < initial; i++) free.push(factory());

  return {
    active,
    acquire: (...args) => {
      const item = free.pop() ?? factory();
      reset?.(item, ...args);
      active.add(item);
      return item;
    },
    release: (item) => {
      if (!active.delete(item)) return;
      free.push(item);
    },
    releaseAll: () => {
      active.forEach((item) => free.push(item));
      active.clear();
    },
    get size() {
      return free.length + active.size;
    },
  };
};
