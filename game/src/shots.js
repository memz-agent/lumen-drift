// The screenshot scenes behind ?shot=title|play|level|over. Each one plays the real rules
// forward from a fresh world, steered by a simple autopilot (velocity-matched steering toward
// the nearest shard, steering away from mines), so the frame is what a short game really looks
// like and the same seed always gives the same frame. The 'over' scene first banks some score,
// then flies a kamikaze pilot into the mines until the run ends.

import { STEP } from './config.js';
import { SCREEN_LEVEL, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

/** Steer by matching a desired velocity: aim at the target, slow down as it gets close. */
function steer(state, tx, ty, topSpeed) {
  const player = state.player;
  const dx = tx - player.x;
  const dy = ty - player.y;
  const dist = Math.hypot(dx, dy) || 1;
  const speed = Math.min(topSpeed, dist * 1.6);
  const wantX = (dx / dist) * speed;
  const wantY = (dy / dist) * speed;
  let cx = wantX - player.vx;
  let cy = wantY - player.vy;
  const cl = Math.hypot(cx, cy);
  if (cl < 26) return { x: 0, y: 0, dash: false, dist };
  cx /= cl;
  cy /= cl;
  return { x: cx, y: cy, dash: false, dist };
}

/** The collecting pilot: nearest shard, with a repulsion shove away from nearby mines. */
function collectorControl(state) {
  const player = state.player;
  let target = null;
  let bestDist = Infinity;
  for (const shard of state.shards) {
    if (shard.taken) continue;
    const d = (shard.x - player.x) ** 2 + (shard.y - player.y) ** 2;
    if (d < bestDist) { bestDist = d; target = shard; }
  }
  if (!target) return { x: 0, y: 0, dash: false };
  const control = steer(state, target.x, target.y, 330);
  // Shove away from any mine close enough to matter, unless already committed to the shard.
  for (const mine of state.mines) {
    const dx = player.x - mine.x;
    const dy = player.y - mine.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.01 && d < 92) {
      const push = (92 - d) / 92;
      control.x += (dx / d) * push * 1.6;
      control.y += (dy / d) * push * 1.6;
    }
  }
  const l = Math.hypot(control.x, control.y);
  if (l > 1) { control.x /= l; control.y /= l; }
  control.dash = control.dist > 360 && player.dashCd <= 0;
  return control;
}

/** The kamikaze pilot: full speed at the nearest mine (or drone), no avoidance at all. */
function kamikazeControl(state) {
  const player = state.player;
  let target = null;
  let bestDist = Infinity;
  for (const hazard of [...state.mines, ...state.drones]) {
    const d = (hazard.x - player.x) ** 2 + (hazard.y - player.y) ** 2;
    if (d < bestDist) { bestDist = d; target = hazard; }
  }
  if (!target) return { x: 0, y: 0, dash: false };
  const control = steer(state, target.x, target.y, 520);
  control.dash = control.dist > 200 && player.dashCd <= 0;
  return control;
}

function simulate(world, seconds, controlFn, stopWhen = null) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (world.state.over) break;
    if (stopWhen && stopWhen(world.state)) break;
    world.step(STEP, controlFn(world.state));
  }
}

/**
 * Set `world` to the named scene (title, play, level or over; any other name is title) and
 * return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name === 'play') {
    // Stop while shards remain: a frame with "2 LEFT" shows the goal better than a cleared cave.
    simulate(world, 16, collectorControl, (state) => state.cleared || state.shardsLeft <= 2);
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'level') {
    world.startLevel(4);
    simulate(world, 9, collectorControl);
    // If the pilot already cleared or died back to the pad, still show the deeper cavern.
    return { screen: world.state.cleared ? SCREEN_LEVEL : SCREEN_PLAY, best: 0 };
  }
  if (name === 'over') {
    simulate(world, 5, collectorControl);
    simulate(world, 300, kamikazeControl);
    return { screen: SCREEN_OVER, best: world.state.score };
  }
  // Title: let the autopilot drift behind the title card for a few seconds of ambience.
  simulate(world, 2.5, collectorControl);
  return { screen: SCREEN_TITLE, best: 0 };
}
