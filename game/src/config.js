// Lumen Drift — tuning constants: the playfield, the orb's physics, the per-level difficulty
// curve and the palette. Everything the other modules need to agree on lives here.

/** Fixed simulation step, in seconds: the world advances in 1/60 s slices. */
export const STEP = 1 / 60;

/** The logical playfield, in pixels. The canvas backing store is exactly this size. */
export const FIELD = { width: 1280, height: 800 };

/** Lives a run starts with. */
export const LIVES = 3;

/** localStorage key for the best score. */
export const BEST_KEY = 'lumen-drift-best';

/** The player orb: momentum physics — strong thrust, weak damping, so it drifts. */
export const PLAYER = {
  radius: 11,
  thrust: 1550, // px/s^2 while a thrust input is held
  damping: 0.82, // exponential velocity damping per second (low: the orb keeps drifting)
  maxSpeed: 545, // soft cap in px/s; a dash may overshoot it briefly
  dashImpulse: 660, // px/s added by one dash
  dashTime: 0.22, // seconds the dash overshoot is allowed before the soft cap bites
  dashCooldown: 1.5, // seconds between dashes
  bounce: 0.55, // fraction of impact speed kept when bouncing off a wall
  wallPenaltySpeed: 250, // impacts faster than this cost points
  wallPenalty: 15, // points lost on a hard wall impact
  invulnerableTime: 2.2, // seconds of grace after losing a life
};

/** Points for one shard; a level's leftover seconds pay this each when the level clears. */
export const SHARD_POINTS = 100;
export const TIME_BONUS_PER_SECOND = 10;

/** Difficulty of one level: more shards, mines, drones and rock as the level number grows. */
export function levelSpec(level) {
  const shards = Math.min(6 + (level - 1) * 2, 18);
  const secondsPerShard = Math.max(2.9, 5.6 - (level - 1) * 0.35);
  return {
    shards,
    timeLimit: Math.round(shards * secondsPerShard),
    mines: Math.min(2 + Math.floor((level - 1) * 1.2), 12),
    drones: level < 2 ? 0 : Math.min(1 + Math.floor((level - 1) * 0.9), 7),
    rocks: Math.min(5 + (level - 1), 11),
    droneSpeed: 46 + (level - 1) * 7,
  };
}

/** Cavern names, cycled by level; later laps gain a roman suffix in the world module. */
export const LEVEL_NAMES = [
  'First Light',
  'Ember Run',
  'The Hollow Choir',
  'Static Bloom',
  'Violet Deep',
  'Glass Storm',
  'Night Orchard',
  'The Long Drift',
  'Emberfall',
  'Ultraviolet',
  'The Quiet Maw',
  'Starless Reach',
];

/** The palette: deep-space blues, cyan light, warm shard gold, hazard magenta and red. */
export const COLORS = {
  spaceTop: '#070b1d',
  spaceBottom: '#04060d',
  rock: '#232c47',
  rockEdge: '#3d4a75',
  rockFace: '#1a2138',
  orbCore: '#ffffff',
  orbGlow: '#6ee7ff',
  orbDeep: '#2563eb',
  shard: '#ffd76a',
  shardCore: '#fff6d8',
  mine: '#1b1026',
  mineCore: '#ff3b5c',
  drone: '#ff4fd8',
  droneRing: '#ffb3f1',
  text: '#dbeafe',
  textDim: '#8ea2c9',
  danger: '#ff5470',
  timerGood: '#39d0ff',
  timerLow: '#ff5470',
};
