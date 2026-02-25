export const BIRD_X = -2;
export const INTRO_BIRD_X = 0.17;
export const INTRO_BIRD_Y = -0.25;
export const INTRO_BIRD_Z = 6;
export const BIRD_RADIUS = 0.4;
export const FLAP_VELOCITY = 3.7;
export const GRAVITY = -9.8;
export const STARTING_DURATION = 1.25;

export const PIPE_SPEED = 2.2;
export const PIPE_WIDTH = 1.2;
export const PIPE_GAP = 3;
export const PIPE_SPAWN_SECONDS = 1.65;
export const PIPE_START_X = 9;
export const PIPE_DESPAWN_X = -10;

export const WORLD_TOP = 4.2;
export const FLOOR_Y = -3.35;

export const CROSSY_GROUND_Y = FLOOR_Y + 0.55;
export const CROSSY_STEP = 1;
export const CROSSY_PLAYER_START_X = -1.024;
export const CROSSY_PLAYER_START_Z = 3;
export const CROSSY_MIN_X = -3.2;
export const CROSSY_MAX_X = 3.2;
export const CROSSY_MIN_Z = -9;
export const CROSSY_MODEL_Y = CROSSY_GROUND_Y + 0.72;

export const CROSSY_LANES = [
  { z: 2, speed: 2.2, direction: 1 },
  { z: 1, speed: 2.8, direction: -1 },
  { z: 0, speed: 3.1, direction: 1 },
  { z: -1, speed: 2.6, direction: -1 },
  { z: -2, speed: 3.4, direction: 1 },
  { z: -3, speed: 2.9, direction: -1 },
  { z: -4, speed: 3.5, direction: 1 },
  { z: -5, speed: 3.1, direction: -1 },
];

export function getCrossySpeedMultiplier(level) {
  return Math.min(2.2, 0.65 + (level - 1) * 0.15);
}

export function getPipeSpeedForScore(score) {
  const level = Math.floor(score / 10);
  return (PIPE_SPEED + level * 0.45) * 1.1;
}

export function randGapY() {
  return -0.4 + Math.random() * 2.6;
}

export function makePipe(id, startX = PIPE_START_X) {
  return {
    id,
    x: startX,
    gapY: randGapY(),
    passed: false,
  };
}
