// The world: seeded cavern generation and the simulation — the orb's momentum physics, wall
// bounces, shards, void mines, patrolling drones, the level timer, lives, score and particles.
// Rendering and sound live elsewhere; step() reports what happened as event bits for them.

import { FIELD, LEVEL_NAMES, LIVES, PLAYER, SHARD_POINTS, TIME_BONUS_PER_SECOND, levelSpec } from './config.js';
import { createRandom, intRange, range } from './random.js';

export const EVENT_PICKUP = 1;
export const EVENT_HIT = 2;
export const EVENT_TIMEUP = 4;
export const EVENT_DASH = 8;
export const EVENT_WALL = 16;
export const EVENT_LEVEL = 32;
export const EVENT_OVER = 64;

/** Thickness of the cavern's outer wall; the playable area sits inside it. */
export const WALL = 26;

const MAX_PARTICLES = 420;

/** Create a world whose caverns grow from the given seed. */
export function createWorld(seed) {
  const state = {
    score: 0,
    lives: LIVES,
    level: 1,
    levelName: LEVEL_NAMES[0],
    time: 0, // seconds since this level began (drives pulses and twinkles)
    timeLeft: 0,
    timeLimit: 1,
    shardsLeft: 0,
    combo: 0,
    lastBonus: 0,
    cleared: false,
    over: false,
    shake: 0,
    player: null,
    rocks: [],
    shards: [],
    mines: [],
    drones: [],
    particles: [],
    nebulas: [],
    stars: [],
    spawn: { x: 110, y: FIELD.height / 2 },
  };

  // The starfield is fixed for the whole run; only its parallax offset moves.
  const starRandom = createRandom(seed ^ 0x51ab3);
  for (let i = 0; i < 150; i += 1) {
    state.stars.push({
      x: starRandom() * FIELD.width,
      y: starRandom() * FIELD.height,
      layer: 0.25 + starRandom() * 0.75,
      size: 0.6 + starRandom() * 1.7,
      phase: starRandom() * Math.PI * 2,
    });
  }

  /** Is a circle at (x, y) clear of every rock (inflated by pad) and inside the walls? */
  function clearOfRocks(x, y, radius, pad) {
    if (x < WALL + radius || x > FIELD.width - WALL - radius) return false;
    if (y < WALL + radius || y > FIELD.height - WALL - radius) return false;
    for (const rock of state.rocks) {
      const nx = Math.max(rock.x - pad, Math.min(x, rock.x + rock.w + pad));
      const ny = Math.max(rock.y - pad, Math.min(y, rock.y + rock.h + pad));
      const dx = x - nx;
      const dy = y - ny;
      if (dx * dx + dy * dy < radius * radius) return false;
    }
    return true;
  }

  /** Scatter points that keep a minimum distance from each other and from the spawn pad. */
  function scatter(random, count, radius, pad, minDist, spawnDist) {
    const points = [];
    let guard = 0;
    while (points.length < count && guard < 600) {
      guard += 1;
      const x = range(random, WALL + 50, FIELD.width - WALL - 50);
      const y = range(random, WALL + 50, FIELD.height - WALL - 50);
      if (!clearOfRocks(x, y, radius, pad)) continue;
      const dx = x - state.spawn.x;
      const dy = y - state.spawn.y;
      if (dx * dx + dy * dy < spawnDist * spawnDist) continue;
      let ok = true;
      for (const p of points) {
        const ddx = x - p.x;
        const ddy = y - p.y;
        if (ddx * ddx + ddy * ddy < minDist * minDist) {
          ok = false;
          break;
        }
      }
      if (ok) points.push({ x, y });
    }
    return points;
  }

  /** Grow the cavern for `level` from its own seed, so a restart regrows the same cave. */
  function generate(level) {
    const random = createRandom((seed ^ Math.imul(level, 0x9e3779b1)) >>> 0);
    const spec = levelSpec(level);
    state.level = level;
    state.levelName = LEVEL_NAMES[(level - 1) % LEVEL_NAMES.length];
    state.time = 0;
    state.timeLimit = spec.timeLimit;
    state.timeLeft = spec.timeLimit;
    state.cleared = false;
    state.combo = 0;

    state.nebulas = [];
    for (let i = 0; i < 5; i += 1) {
      state.nebulas.push({
        x: random() * FIELD.width,
        y: random() * FIELD.height,
        r: range(random, 150, 330),
        hue: intRange(random, 0, 3),
        alpha: range(random, 0.05, 0.11),
      });
    }

    state.rocks = [];
    let guard = 0;
    while (state.rocks.length < spec.rocks && guard < 300) {
      guard += 1;
      const w = range(random, 62, 190);
      const h = range(random, 46, 150);
      const x = range(random, WALL + 24, FIELD.width - WALL - 24 - w);
      const y = range(random, WALL + 24, FIELD.height - WALL - 24 - h);
      const dx = Math.max(x - state.spawn.x, 0, state.spawn.x - (x + w));
      const dy = Math.max(y - state.spawn.y, 0, state.spawn.y - (y + h));
      if (dx * dx + dy * dy < 150 * 150) continue; // keep the spawn clearing open
      state.rocks.push({ x, y, w, h });
    }

    state.shards = scatter(random, spec.shards, 12, 16, 74, 70).map((p) => ({
      ...p,
      taken: false,
      phase: random() * Math.PI * 2,
    }));
    state.shardsLeft = state.shards.length;

    state.mines = scatter(random, spec.mines, 14, 10, 120, 230).map((p) => ({
      ...p,
      phase: random() * Math.PI * 2,
    }));

    state.drones = [];
    const droneSpots = scatter(random, spec.drones, 14, 10, 150, 260);
    for (const spot of droneSpots) {
      if (random() < 0.5) {
        state.drones.push({
          mode: 'orbit',
          cx: spot.x,
          cy: spot.y,
          orbit: range(random, 34, 74),
          angle: random() * Math.PI * 2,
          speed: (spec.droneSpeed / 52) * (random() < 0.5 ? 1 : -1),
          x: spot.x,
          y: spot.y,
          phase: random() * Math.PI * 2,
        });
      } else {
        const horizontal = random() < 0.5;
        const half = range(random, 55, 110);
        state.drones.push({
          mode: 'patrol',
          cx: spot.x,
          cy: spot.y,
          ax: spot.x + (horizontal ? -half : 0),
          ay: spot.y + (horizontal ? 0 : -half),
          bx: spot.x + (horizontal ? half : 0),
          by: spot.y + (horizontal ? 0 : half),
          t: random(),
          dir: random() < 0.5 ? 1 : -1,
          speed: spec.droneSpeed / (half * 2),
          x: spot.x,
          y: spot.y,
          phase: random() * Math.PI * 2,
        });
      }
    }
    respawnPlayer();
  }

  /** Put the orb back on the spawn pad, stopped, with a grace period. */
  function respawnPlayer() {
    state.player = {
      x: state.spawn.x,
      y: state.spawn.y,
      vx: 0,
      vy: 0,
      faceX: 1,
      faceY: 0,
      dashCd: 0,
      dashT: 0,
      invuln: PLAYER.invulnerableTime,
      wallCd: 0,
      trailAcc: 0,
    };
  }

  /** Add one particle, capped so bursts can never grow the array without bound. */
  function spawnParticle(p) {
    if (state.particles.length >= MAX_PARTICLES) state.particles.shift();
    state.particles.push(p);
  }

  /** A radial burst of sparks (shard pickups, explosions, wall scrapes). */
  function burst(x, y, count, color, speed, life, size) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const v = speed * (0.25 + Math.random() * 0.95);
      spawnParticle({
        x,
        y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        life: life * (0.5 + Math.random() * 0.8),
        maxLife: life,
        size: size * (0.6 + Math.random() * 0.9),
        color,
        drag: 2.6,
      });
    }
  }

  function updateParticles(dt) {
    const list = state.particles;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const p = list[i];
      p.life -= dt;
      if (p.life <= 0) {
        list.splice(i, 1);
        continue;
      }
      const drag = Math.exp(-p.drag * dt);
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  /** Bounce the orb off one rock; returns the impact speed along the normal (0 = no hit). */
  function collideRock(player, rock) {
    const nx = Math.max(rock.x, Math.min(player.x, rock.x + rock.w));
    const ny = Math.max(rock.y, Math.min(player.y, rock.y + rock.h));
    let dx = player.x - nx;
    let dy = player.y - ny;
    const distSq = dx * dx + dy * dy;
    if (distSq >= PLAYER.radius * PLAYER.radius) return 0;
    if (distSq < 0.0001) {
      // Centre inside the rock: leave by the shallowest side.
      const left = player.x - rock.x;
      const right = rock.x + rock.w - player.x;
      const top = player.y - rock.y;
      const bottom = rock.y + rock.h - player.y;
      const min = Math.min(left, right, top, bottom);
      if (min === left) { dx = -1; dy = 0; player.x = rock.x - PLAYER.radius; }
      else if (min === right) { dx = 1; dy = 0; player.x = rock.x + rock.w + PLAYER.radius; }
      else if (min === top) { dx = 0; dy = -1; player.y = rock.y - PLAYER.radius; }
      else { dx = 0; dy = 1; player.y = rock.y + rock.h + PLAYER.radius; }
    } else {
      const dist = Math.sqrt(distSq);
      dx /= dist;
      dy /= dist;
      player.x = nx + dx * PLAYER.radius;
      player.y = ny + dy * PLAYER.radius;
    }
    const vn = player.vx * dx + player.vy * dy;
    if (vn >= 0) return 0;
    player.vx -= (1 + PLAYER.bounce) * vn * dx;
    player.vy -= (1 + PLAYER.bounce) * vn * dy;
    return -vn;
  }

  /** Bounce the orb off the outer walls; returns the hardest impact speed. */
  function collideBounds(player) {
    let impact = 0;
    const minX = WALL + PLAYER.radius;
    const maxX = FIELD.width - WALL - PLAYER.radius;
    const minY = WALL + PLAYER.radius;
    const maxY = FIELD.height - WALL - PLAYER.radius;
    if (player.x < minX) { player.x = minX; if (player.vx < 0) { impact = Math.max(impact, -player.vx); player.vx = -player.vx * PLAYER.bounce; } }
    if (player.x > maxX) { player.x = maxX; if (player.vx > 0) { impact = Math.max(impact, player.vx); player.vx = -player.vx * PLAYER.bounce; } }
    if (player.y < minY) { player.y = minY; if (player.vy < 0) { impact = Math.max(impact, -player.vy); player.vy = -player.vy * PLAYER.bounce; } }
    if (player.y > maxY) { player.y = maxY; if (player.vy > 0) { impact = Math.max(impact, player.vy); player.vy = -player.vy * PLAYER.bounce; } }
    return impact;
  }

  /** A life is lost (mine, drone or empty timer): explode, count down, respawn or end. */
  function loseLife(events, cause) {
    const player = state.player;
    burst(player.x, player.y, 30, '#6ee7ff', 320, 0.7, 3);
    burst(player.x, player.y, 16, '#ff3b5c', 220, 0.6, 2.4);
    state.shake = Math.min(16, state.shake + 13);
    state.combo = 0;
    state.lives -= 1;
    if (state.lives <= 0) {
      state.over = true;
      return events | EVENT_OVER;
    }
    if (cause === 'time') {
      generate(state.level); // the cavern regrows; the score and lives carry over
    } else {
      respawnPlayer();
    }
    return events;
  }

  /** Move the drones along their orbits and patrol lines. */
  function updateDrones(dt) {
    for (const drone of state.drones) {
      if (drone.mode === 'orbit') {
        drone.angle += drone.speed * dt;
        drone.x = drone.cx + Math.cos(drone.angle) * drone.orbit;
        drone.y = drone.cy + Math.sin(drone.angle) * drone.orbit;
      } else {
        drone.t += drone.dir * drone.speed * dt;
        if (drone.t > 1) { drone.t = 1; drone.dir = -1; }
        if (drone.t < 0) { drone.t = 0; drone.dir = 1; }
        drone.x = drone.ax + (drone.bx - drone.ax) * drone.t;
        drone.y = drone.ay + (drone.by - drone.ay) * drone.t;
      }
    }
  }

  /** Advance the simulation one slice. control: {x, y} thrust in -1..1, dash a boolean. */
  function step(dt, control) {
    let events = 0;
    state.time += dt;
    state.shake *= Math.exp(-7 * dt);
    if (state.shake < 0.05) state.shake = 0;
    updateParticles(dt);
    if (state.over || state.cleared) return events;

    const player = state.player;
    player.dashCd = Math.max(0, player.dashCd - dt);
    player.dashT = Math.max(0, player.dashT - dt);
    player.invuln = Math.max(0, player.invuln - dt);
    player.wallCd = Math.max(0, player.wallCd - dt);
    updateDrones(dt);

    // Thrust: normalize the input so diagonals are not faster.
    let cx = control.x;
    let cy = control.y;
    const len = Math.hypot(cx, cy);
    if (len > 1) { cx /= len; cy /= len; }
    if (len > 0.05) { player.faceX = cx; player.faceY = cy; }

    if (control.dash && player.dashCd <= 0) {
      let dx = cx;
      let dy = cy;
      if (Math.hypot(dx, dy) < 0.05) {
        const speed = Math.hypot(player.vx, player.vy);
        if (speed > 10) { dx = player.vx / speed; dy = player.vy / speed; }
        else { dx = player.faceX; dy = player.faceY; }
      }
      const dl = Math.hypot(dx, dy) || 1;
      player.vx += (dx / dl) * PLAYER.dashImpulse;
      player.vy += (dy / dl) * PLAYER.dashImpulse;
      player.dashCd = PLAYER.dashCooldown;
      player.dashT = PLAYER.dashTime;
      events |= EVENT_DASH;
      for (let i = 0; i < 10; i += 1) {
        spawnParticle({
          x: player.x - (dx / dl) * PLAYER.radius * i * 0.4,
          y: player.y - (dy / dl) * PLAYER.radius * i * 0.4,
          vx: -dx * 60 + (Math.random() - 0.5) * 40,
          vy: -dy * 60 + (Math.random() - 0.5) * 40,
          life: 0.3,
          maxLife: 0.3,
          size: 3.4 - i * 0.22,
          color: '#a5f3fc',
          drag: 3,
        });
      }
    }

    // Two substeps keep a dashing orb from tunnelling through rock.
    const sub = 2;
    const sdt = dt / sub;
    for (let s = 0; s < sub; s += 1) {
      player.vx += cx * PLAYER.thrust * sdt;
      player.vy += cy * PLAYER.thrust * sdt;
      const damp = Math.exp(-PLAYER.damping * sdt);
      player.vx *= damp;
      player.vy *= damp;
      const speed = Math.hypot(player.vx, player.vy);
      if (player.dashT <= 0 && speed > PLAYER.maxSpeed) {
        const pull = 1 - Math.min(1, 3.2 * sdt);
        const target = PLAYER.maxSpeed + (speed - PLAYER.maxSpeed) * pull;
        player.vx *= target / speed;
        player.vy *= target / speed;
      }
      player.x += player.vx * sdt;
      player.y += player.vy * sdt;
      let impact = collideBounds(player);
      for (const rock of state.rocks) impact = Math.max(impact, collideRock(player, rock));
      if (impact > PLAYER.wallPenaltySpeed && player.wallCd <= 0) {
        player.wallCd = 0.3;
        state.score = Math.max(0, state.score - PLAYER.wallPenalty);
        state.shake = Math.min(16, state.shake + 5);
        burst(player.x, player.y, 7, '#9db4e8', 150, 0.35, 2);
        events |= EVENT_WALL;
      }
    }

    // Thrust trail: a stream of fading motes behind the orb while it burns.
    if (len > 0.05) {
      player.trailAcc += dt * 110;
      while (player.trailAcc >= 1) {
        player.trailAcc -= 1;
        spawnParticle({
          x: player.x - cx * PLAYER.radius + (Math.random() - 0.5) * 7,
          y: player.y - cy * PLAYER.radius + (Math.random() - 0.5) * 7,
          vx: -cx * 70 + (Math.random() - 0.5) * 30,
          vy: -cy * 70 + (Math.random() - 0.5) * 30,
          life: 0.42,
          maxLife: 0.42,
          size: 2.6,
          color: '#67e8f9',
          drag: 2.2,
        });
      }
    }

    // Shards.
    for (const shard of state.shards) {
      if (shard.taken) continue;
      const dx = player.x - shard.x;
      const dy = player.y - shard.y;
      if (dx * dx + dy * dy < (PLAYER.radius + 11) * (PLAYER.radius + 11)) {
        shard.taken = true;
        state.shardsLeft -= 1;
        state.combo += 1;
        state.score += SHARD_POINTS;
        burst(shard.x, shard.y, 14, '#ffd76a', 210, 0.5, 2.6);
        events |= EVENT_PICKUP;
        if (state.shardsLeft <= 0) {
          state.lastBonus = Math.ceil(state.timeLeft) * TIME_BONUS_PER_SECOND;
          state.score += state.lastBonus;
          state.cleared = true;
          events |= EVENT_LEVEL;
        }
      }
    }

    // Hazards bite only outside the grace period after a respawn.
    if (player.invuln <= 0 && !state.cleared) {
      for (const mine of state.mines) {
        const dx = player.x - mine.x;
        const dy = player.y - mine.y;
        if (dx * dx + dy * dy < (PLAYER.radius + 12) * (PLAYER.radius + 12)) {
          return loseLife(events | EVENT_HIT, 'mine');
        }
      }
      for (const drone of state.drones) {
        const dx = player.x - drone.x;
        const dy = player.y - drone.y;
        if (dx * dx + dy * dy < (PLAYER.radius + 11) * (PLAYER.radius + 11)) {
          return loseLife(events | EVENT_HIT, 'drone');
        }
      }
    }

    // The timer is the third hazard — but a level cleared this very step stays cleared.
    if (!state.cleared) {
      state.timeLeft -= dt;
      if (state.timeLeft <= 0) {
        state.timeLeft = 0;
        return loseLife(events | EVENT_TIMEUP, 'time');
      }
    }
    return events;
  }

  return {
    state,
    /** Start a fresh run: score and lives reset, level 1 regrows. */
    reset() {
      state.score = 0;
      state.lives = LIVES;
      state.over = false;
      state.particles = [];
      state.shake = 0;
      generate(1);
    },
    /** Grow (or regrow) one level, keeping score and lives. */
    startLevel(level) {
      generate(level);
    },
    /**
     * Ambience for the title screen: advance the clock, particles and drones so the cavern
     * behind the card breathes, without touching the player, the timer or the score.
     */
    attract(dt) {
      state.time += dt;
      state.shake *= Math.exp(-7 * dt);
      if (state.shake < 0.05) state.shake = 0;
      updateParticles(dt);
      updateDrones(dt);
    },
    step,
  };
}
