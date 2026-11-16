// Canvas rendering: the starfield and nebulae, the cavern, shards, mines, drones, the orb and
// its particles, the HUD, and the title / pause / level / game-over screens. Everything is
// drawn with canvas primitives and gradients — there are no image assets.

import { COLORS, FIELD, PLAYER } from './config.js';
import { WALL } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_LEVEL = 'level';
export const SCREEN_OVER = 'over';

const NEBULA_HUES = ['#274690', '#5b2a86', '#0f5e6b', '#7a2d5e'];

/** Create the renderer bound to the game canvas. */
export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  function drawBackground(state) {
    const gradient = ctx.createLinearGradient(0, 0, 0, FIELD.height);
    gradient.addColorStop(0, COLORS.spaceTop);
    gradient.addColorStop(1, COLORS.spaceBottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);

    // Nebula clouds, additive and very faint.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const neb of state.nebulas) {
      const g = ctx.createRadialGradient(neb.x, neb.y, 0, neb.x, neb.y, neb.r);
      const hue = NEBULA_HUES[neb.hue % NEBULA_HUES.length];
      g.addColorStop(0, hue);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = neb.alpha;
      ctx.fillStyle = g;
      ctx.fillRect(neb.x - neb.r, neb.y - neb.r, neb.r * 2, neb.r * 2);
    }
    ctx.restore();

    // Stars drift against the orb's position (parallax) and twinkle on the level clock.
    const px = state.player ? state.player.x : FIELD.width / 2;
    const py = state.player ? state.player.y : FIELD.height / 2;
    for (const star of state.stars) {
      const ox = ((star.x - px * 0.03 * star.layer) % FIELD.width + FIELD.width) % FIELD.width;
      const oy = ((star.y - py * 0.03 * star.layer) % FIELD.height + FIELD.height) % FIELD.height;
      const tw = 0.55 + 0.45 * Math.sin(state.time * 1.7 + star.phase);
      ctx.globalAlpha = 0.35 + 0.55 * star.layer * tw;
      ctx.fillStyle = '#cfe6ff';
      ctx.fillRect(ox, oy, star.size, star.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawRocks(state) {
    // The outer wall frame.
    ctx.fillStyle = COLORS.rock;
    ctx.fillRect(0, 0, FIELD.width, WALL);
    ctx.fillRect(0, FIELD.height - WALL, FIELD.width, WALL);
    ctx.fillRect(0, 0, WALL, FIELD.height);
    ctx.fillRect(FIELD.width - WALL, 0, WALL, FIELD.height);
    ctx.strokeStyle = COLORS.rockEdge;
    ctx.lineWidth = 2;
    ctx.strokeRect(WALL, WALL, FIELD.width - WALL * 2, FIELD.height - WALL * 2);
    // Interior rock blocks: dark face, lit top edge, thin bright rim.
    for (const rock of state.rocks) {
      ctx.fillStyle = COLORS.rockFace;
      ctx.fillRect(rock.x, rock.y, rock.w, rock.h);
      ctx.fillStyle = COLORS.rock;
      ctx.fillRect(rock.x, rock.y, rock.w, Math.min(7, rock.h));
      ctx.strokeStyle = COLORS.rockEdge;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(rock.x + 0.75, rock.y + 0.75, rock.w - 1.5, rock.h - 1.5);
    }
    // The spawn pad: a faint ring where the orb rekindles.
    ctx.save();
    ctx.strokeStyle = 'rgba(110,231,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(state.spawn.x, state.spawn.y, 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawShards(state) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const shard of state.shards) {
      if (shard.taken) continue;
      const pulse = 1 + 0.16 * Math.sin(state.time * 3.2 + shard.phase);
      const r = 9 * pulse;
      const glow = ctx.createRadialGradient(shard.x, shard.y, 0, shard.x, shard.y, 26 * pulse);
      glow.addColorStop(0, 'rgba(255,215,106,0.5)');
      glow.addColorStop(1, 'rgba(255,215,106,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(shard.x - 28, shard.y - 28, 56, 56);
      ctx.save();
      ctx.translate(shard.x, shard.y);
      ctx.rotate(state.time * 1.4 + shard.phase);
      ctx.fillStyle = COLORS.shard;
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.62, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r * 0.62, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = COLORS.shardCore;
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.45);
      ctx.lineTo(r * 0.28, 0);
      ctx.lineTo(0, r * 0.45);
      ctx.lineTo(-r * 0.28, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawMines(state) {
    for (const mine of state.mines) {
      const pulse = 0.5 + 0.5 * Math.sin(state.time * 2.6 + mine.phase);
      ctx.save();
      // Danger halo that breathes with the pulse.
      ctx.globalCompositeOperation = 'lighter';
      const halo = ctx.createRadialGradient(mine.x, mine.y, 0, mine.x, mine.y, 30);
      halo.addColorStop(0, `rgba(255,59,92,${0.16 + 0.14 * pulse})`);
      halo.addColorStop(1, 'rgba(255,59,92,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(mine.x - 30, mine.y - 30, 60, 60);
      ctx.globalCompositeOperation = 'source-over';
      // Spikes.
      ctx.strokeStyle = '#4a3558';
      ctx.lineWidth = 3;
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2 + mine.phase;
        ctx.beginPath();
        ctx.moveTo(mine.x + Math.cos(a) * 8, mine.y + Math.sin(a) * 8);
        ctx.lineTo(mine.x + Math.cos(a) * 15, mine.y + Math.sin(a) * 15);
        ctx.stroke();
      }
      ctx.fillStyle = COLORS.mine;
      ctx.beginPath();
      ctx.arc(mine.x, mine.y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.mineCore;
      ctx.beginPath();
      ctx.arc(mine.x, mine.y, 3.4 + 1.8 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawDrones(state) {
    for (const drone of state.drones) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(drone.x, drone.y, 0, drone.x, drone.y, 30);
      glow.addColorStop(0, 'rgba(255,79,216,0.4)');
      glow.addColorStop(1, 'rgba(255,79,216,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(drone.x - 30, drone.y - 30, 60, 60);
      ctx.globalCompositeOperation = 'source-over';
      // The patrol path, faint, so a player can read the drone's route.
      ctx.strokeStyle = 'rgba(255,79,216,0.16)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (drone.mode === 'orbit') ctx.arc(drone.cx, drone.cy, drone.orbit, 0, Math.PI * 2);
      else { ctx.moveTo(drone.ax, drone.ay); ctx.lineTo(drone.bx, drone.by); }
      ctx.stroke();
      // A rotating broken ring around a magenta core.
      ctx.strokeStyle = COLORS.droneRing;
      ctx.lineWidth = 2.5;
      const spin = state.time * 2.4 + drone.phase;
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.arc(drone.x, drone.y, 13, spin + (i * Math.PI * 2) / 3, spin + (i * Math.PI * 2) / 3 + 1.7);
        ctx.stroke();
      }
      ctx.fillStyle = COLORS.drone;
      ctx.beginPath();
      ctx.arc(drone.x, drone.y, 7.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(drone.x, drone.y, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawParticles(state) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of state.particles) {
      const fade = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = fade;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * fade), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawPlayer(state) {
    const player = state.player;
    if (!player) return;
    // Respawn grace blinks the orb.
    if (player.invuln > 0 && Math.floor(state.time * 12) % 2 === 0 && state.lives > 0 && !state.over) {
      // draw dimmer below by lowering alpha
      ctx.save();
      ctx.globalAlpha = 0.35;
    } else {
      ctx.save();
    }
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(player.x, player.y, 0, player.x, player.y, 44);
    glow.addColorStop(0, 'rgba(110,231,255,0.55)');
    glow.addColorStop(0.4, 'rgba(59,130,246,0.25)');
    glow.addColorStop(1, 'rgba(37,99,235,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(player.x - 44, player.y - 44, 88, 88);
    ctx.globalCompositeOperation = 'source-over';
    const body = ctx.createRadialGradient(
      player.x - 3, player.y - 3, 1,
      player.x, player.y, PLAYER.radius,
    );
    body.addColorStop(0, COLORS.orbCore);
    body.addColorStop(0.55, COLORS.orbGlow);
    body.addColorStop(1, COLORS.orbDeep);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(player.x, player.y, PLAYER.radius, 0, Math.PI * 2);
    ctx.fill();
    // A small bright nose marks the facing direction.
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(player.x + player.faceX * 5, player.y + player.faceY * 5, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function text(str, x, y, size, color, align = 'left', weight = 600) {
    ctx.font = `${weight} ${size}px system-ui, 'Segoe UI', sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  /** The heads-up display: score, best, lives, shards, level, timer bar and dash meter. */
  function drawHud(state, best, muted) {
    const pad = WALL + 16;
    text(`SCORE ${state.score}`, pad, 52, 21, COLORS.text, 'left', 700);
    text(`BEST ${Math.max(best, state.score)}`, pad, 76, 13, COLORS.textDim, 'left', 600);
    // Lives as small orbs under the score.
    for (let i = 0; i < state.lives; i += 1) {
      const x = pad + 9 + i * 24;
      const g = ctx.createRadialGradient(x - 2, 94, 1, x, 97, 9);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.6, COLORS.orbGlow);
      g.addColorStop(1, COLORS.orbDeep);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, 97, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    text(`LEVEL ${state.level}`, FIELD.width - pad, 52, 21, COLORS.text, 'right', 700);
    text(state.levelName.toUpperCase(), FIELD.width - pad, 76, 13, COLORS.textDim, 'right', 600);
    // Shards remaining, with a small diamond glyph.
    const shardLabel = `◆ ${state.shardsLeft} LEFT`;
    text(shardLabel, FIELD.width - pad, 104, 15, COLORS.shard, 'right', 700);
    // Dash meter, bottom-left: fills as the cooldown returns.
    const player = state.player;
    const ready = player && player.dashCd <= 0;
    const frac = player ? 1 - player.dashCd / 1.5 : 1;
    text('DASH', pad, FIELD.height - 44, 12, ready ? COLORS.orbGlow : COLORS.textDim, 'left', 700);
    ctx.fillStyle = 'rgba(142,162,201,0.25)';
    ctx.fillRect(pad, FIELD.height - 38, 92, 7);
    ctx.fillStyle = ready ? COLORS.orbGlow : '#5b6f9e';
    ctx.fillRect(pad, FIELD.height - 38, 92 * Math.max(0, Math.min(1, frac)), 7);
    if (muted) text('SOUND OFF (M)', FIELD.width - pad, FIELD.height - 44, 12, COLORS.textDim, 'right', 600);
    // The timer bar across the very top: the level's draining light.
    const ratio = Math.max(0, state.timeLeft / state.timeLimit);
    ctx.fillStyle = 'rgba(10,14,28,0.85)';
    ctx.fillRect(0, 0, FIELD.width, 16);
    ctx.fillStyle = ratio < 0.25 ? COLORS.timerLow : COLORS.timerGood;
    ctx.fillRect(0, 0, FIELD.width * ratio, 10);
    if (ratio < 0.25 && Math.floor(state.time * 4) % 2 === 0) {
      text(`${Math.ceil(state.timeLeft)}`, FIELD.width / 2, 40, 20, COLORS.danger, 'center', 800);
    }
  }

  function dim(alpha) {
    ctx.fillStyle = `rgba(3,5,12,${alpha})`;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  function drawTitle(state, best) {
    dim(0.45);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(640, 268, 10, 640, 268, 330);
    g.addColorStop(0, 'rgba(110,231,255,0.20)');
    g.addColorStop(1, 'rgba(110,231,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(310, 0, 660, 560);
    ctx.restore();
    text('LUMEN DRIFT', 640, 258, 84, '#eaf7ff', 'center', 800);
    text('a momentum arcade in the dark', 640, 300, 21, COLORS.orbGlow, 'center', 500);
    text('Pilot the last light through the caverns.', 640, 372, 19, COLORS.text, 'center', 500);
    text('Collect every ◆ shard before the timer drains.', 640, 402, 19, COLORS.text, 'center', 500);
    text('Void mines and drones snuff a life on touch. Walls bite back.', 640, 432, 19, COLORS.text, 'center', 500);
    text('WASD / ARROWS or hold MOUSE — thrust      SPACE — dash      P — pause      M — mute', 640, 486, 16, COLORS.textDim, 'center', 600);
    if (best > 0) text(`BEST ${best}`, 640, 524, 16, COLORS.shard, 'center', 700);
    if (Math.floor(performance.now() / 550) % 2 === 0) {
      text('PRESS ENTER OR CLICK TO DRIFT', 640, 588, 23, '#ffffff', 'center', 800);
    }
  }

  function drawLevelBanner(state) {
    dim(0.35);
    text(`LEVEL ${state.level}`, 640, 356, 58, '#eaf7ff', 'center', 800);
    text(state.levelName, 640, 402, 26, COLORS.orbGlow, 'center', 600);
    text(
      `${state.shards.length} shards · ${state.timeLimit} seconds${state.mines.length ? ` · ${state.mines.length} mines` : ''}${state.drones.length ? ` · ${state.drones.length} drones` : ''}`,
      640, 446, 18, COLORS.textDim, 'center', 500,
    );
    if (state.lastBonus > 0) text(`TIME BONUS +${state.lastBonus}`, 640, 492, 19, COLORS.shard, 'center', 700);
  }

  function drawPaused() {
    dim(0.55);
    text('PAUSED', 640, 392, 54, '#eaf7ff', 'center', 800);
    text('P or ESC to resume', 640, 436, 18, COLORS.textDim, 'center', 500);
  }

  function drawOver(state, best) {
    dim(0.6);
    text('THE LIGHT FADES', 640, 330, 62, '#ffb3c2', 'center', 800);
    text(`FINAL SCORE ${state.score}`, 640, 402, 30, '#ffffff', 'center', 800);
    text(`Reached level ${state.level} · Best ${Math.max(best, state.score)}`, 640, 442, 19, COLORS.textDim, 'center', 500);
    if (Math.floor(performance.now() / 550) % 2 === 0) {
      text('PRESS ENTER OR CLICK TO DRIFT AGAIN', 640, 512, 21, '#ffffff', 'center', 800);
    }
  }

  return {
    /**
     * Paint one frame. screen is one of the SCREEN_* constants; best is the stored best
     * score; muted shows the sound-off marker. Shake offsets the whole scene.
     */
    draw(state, screen, best, muted) {
      ctx.save();
      if (state.shake > 0.1) {
        const dx = (Math.random() - 0.5) * state.shake;
        const dy = (Math.random() - 0.5) * state.shake;
        ctx.translate(dx, dy);
      }
      drawBackground(state);
      drawRocks(state);
      drawShards(state);
      drawMines(state);
      drawDrones(state);
      drawParticles(state);
      if (screen !== SCREEN_OVER) drawPlayer(state);
      ctx.restore();
      if (screen !== SCREEN_TITLE) drawHud(state, best, muted);
      if (screen === SCREEN_TITLE) drawTitle(state, best);
      else if (screen === SCREEN_LEVEL) drawLevelBanner(state);
      else if (screen === SCREEN_PAUSED) drawPaused();
      else if (screen === SCREEN_OVER) drawOver(state, best);
    },
  };
}
