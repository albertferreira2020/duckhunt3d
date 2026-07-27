/**
 * Modos do jogo — mesmos parâmetros do `StartScreen` original (moves/ammo/ducks),
 * acrescidos de clima e comportamento de disparo próprios de cada um.
 */
export const GAME_MODES = {
  classic: {
    id: 'classic',
    name: 'CLÁSSICO',
    description: 'Três cartuchos por rodada. Erre pouco.',
    moves: 7,
    ammo: 3,
    ducks: 2,
    autoFire: false,
    ducksPerRound: 0,
    weather: 'clear',
    fireRate: 0.28,
  },
  modern: {
    id: 'modern',
    name: 'MODERNO',
    description: 'Mais patos, mais munição, fim de tarde.',
    moves: 6,
    ammo: 5,
    ducks: 3,
    autoFire: false,
    ducksPerRound: 0,
    weather: 'sunset',
    fireRate: 0.22,
  },
  extreme: {
    id: 'extreme',
    name: 'EXTREMO',
    description: 'Automática. Um pato a mais a cada rodada.',
    moves: 7,
    ammo: 50,
    ducks: 1,
    autoFire: true,
    ducksPerRound: 1,
    weather: 'overcast',
    fireRate: 0.1,
  },
};

export const MODE_LIST = Object.values(GAME_MODES);
