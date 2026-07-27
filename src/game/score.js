const BEST_KEY = 'duckhunt3d.best';

/**
 * Porte do `PointsHandler`.
 *
 * Fórmula base preservada: um acerto vale 10; um disparo que derruba n>1 patos vale
 * 20 × n (o bônus de combo do original). Sobre isso entram o multiplicador da variante
 * do pato e a sequência de acertos sem errar.
 */
export const createScore = ({ events } = {}) => {
  const state = {
    points: 0,
    level: 0,
    streak: 0,
    bestStreak: 0,
    shots: 0,
    hits: 0,
  };

  const readBest = () => Number(localStorage.getItem(BEST_KEY) ?? 0) || 0;

  const streakMultiplier = () => 1 + Math.min(Math.floor(state.streak / 4), 5) * 0.25;

  const addHits = (ducks) => {
    const n = ducks.length;
    if (n === 0) return 0;

    const base = n === 1 ? 10 : 20 * n;
    const variant = ducks.reduce((sum, d) => sum + (d.scoreMultiplier ?? 1), 0) / n;
    const gained = Math.round(base * variant * streakMultiplier());

    state.points += gained;
    state.hits += n;
    state.streak += n;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    events?.emit('score:changed', { ...state, gained, combo: n });
    return gained;
  };

  const registerShot = () => {
    state.shots++;
    events?.emit('score:shot', state.shots);
  };

  const breakStreak = () => {
    if (state.streak === 0) return;
    state.streak = 0;
    events?.emit('score:streak-broken');
  };

  const addLevel = () => {
    state.level++;
    events?.emit('score:level', state.level);
  };

  const commitBest = () => {
    if (state.points <= readBest()) return readBest();
    try {
      localStorage.setItem(BEST_KEY, String(state.points));
    } catch {
      /* modo privado */
    }
    return state.points;
  };

  return {
    state,
    addHits,
    registerShot,
    breakStreak,
    addLevel,
    commitBest,
    get best() {
      return readBest();
    },
    get accuracy() {
      return state.shots ? Math.round((state.hits / state.shots) * 100) : 0;
    },
    get multiplier() {
      return streakMultiplier();
    },
    reset: () => {
      state.points = 0;
      state.level = 0;
      state.streak = 0;
      state.bestStreak = 0;
      state.shots = 0;
      state.hits = 0;
    },
  };
};
