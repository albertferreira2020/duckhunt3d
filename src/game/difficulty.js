import { clamp } from '../utils/math.js';

const MAX_DUCKS = 20;

/**
 * Escalonamento automático de dificuldade.
 *
 * O original tinha parâmetros fixos por modo. Aqui o modo define a linha de base e
 * a progressão sobe com rodada e pontuação: mais patos, voos mais rápidos e curvas
 * mais agressivas (o `difficulty` normalizado alimenta o `duckBrain`).
 */
export const computeRoundPlan = ({ mode, level, score }) => {
  const growth = Math.floor((level - 1) / 3) + (mode.ducksPerRound ? level - 1 : 0);
  const ducks = clamp(mode.ducks + growth, 1, MAX_DUCKS);

  // Duas fontes independentes: quem sobrevive muitas rodadas e quem pontua alto
  const byLevel = (level - 1) / 14;
  const byScore = score / 9000;
  const difficulty = clamp(byLevel * 0.65 + byScore * 0.35, 0, 1);

  return {
    ducks,
    difficulty,
    // `moves` continua sendo a duração da rodada em segundos, como no original
    roundSeconds: Math.max(4, mode.moves - Math.floor(level / 8)),
    ammo: mode.ammo,
    /** % de abates necessária para não perder vida — igual ao original. */
    passThreshold: 90,
  };
};
