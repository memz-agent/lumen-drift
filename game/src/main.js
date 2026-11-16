// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), sound answers the world's events, and the
// renderer paints what is there. The game moves between five screens: title, level banner,
// play, paused and game over.
//
// ?seed=N fixes the cavern pattern. ?shot=title|play|level|over (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady.

import { BEST_KEY, STEP } from './config.js';
import {
  createWorld,
  EVENT_DASH,
  EVENT_HIT,
  EVENT_LEVEL,
  EVENT_OVER,
  EVENT_PICKUP,
  EVENT_TIMEUP,
  EVENT_WALL,
} from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import {
  createRenderer,
  SCREEN_LEVEL,
  SCREEN_OVER,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;
/** Seconds the level banner holds before play begins. */
const BANNER_SECONDS = 1.8;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(seed);
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, false);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let bannerLeft = 0;
  let pendingLevel = 1;

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.unlock();
    audio.ui();
    world.reset();
    pendingLevel = 1;
    bannerLeft = BANNER_SECONDS;
    screen = SCREEN_LEVEL;
    announce('Lumen Drift. Level 1: collect every shard before the timer drains.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(`Game over. Score ${world.state.score}. Best ${best}.`);
  }

  /** The frame's thrust: the keyboard, or the held mouse aiming from the orb to the pointer. */
  function readControl(dash) {
    const pointer = input.pointer();
    if (pointer.down && world.state.player) {
      const dx = pointer.x - world.state.player.x;
      const dy = pointer.y - world.state.player.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 26) return { x: dx / dist, y: dy / dist, dash };
      return { x: 0, y: 0, dash };
    }
    const dir = input.direction();
    return { x: dir.x, y: dir.y, dash };
  }

  function handleEvents(events) {
    if (events & EVENT_PICKUP) audio.pickup(world.state.combo);
    if (events & EVENT_DASH) audio.dash();
    if (events & EVENT_WALL) audio.thud();
    if (events & EVENT_HIT) {
      audio.hit();
      announce(world.state.lives === 1 ? 'Hit. 1 life left.' : `Hit. ${world.state.lives} lives left.`);
    }
    if (events & EVENT_TIMEUP) {
      audio.timeUp();
      announce('Time gone. A life is lost and the cavern regrows.');
    }
    if (events & EVENT_LEVEL) {
      audio.levelClear();
      pendingLevel = world.state.level + 1;
      world.startLevel(pendingLevel); // the banner already shows the new cavern behind it
      bannerLeft = BANNER_SECONDS;
      screen = SCREEN_LEVEL;
      announce(`Level ${pendingLevel - 1} cleared. Bonus ${world.state.lastBonus}.`);
    }
    if (events & EVENT_OVER) {
      audio.gameOver();
      endGame();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const frameSeconds = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;

    const actions = input.takeActions();
    const dashPressed = input.takeDash();
    if (actions & ACTION_MUTE) {
      audio.unlock();
      announce(audio.toggleMute() ? 'Sound off.' : 'Sound on.');
    }
    if ((actions & ACTION_CONFIRM) || dashPressed) {
      if (screen === SCREEN_TITLE || screen === SCREEN_OVER) {
        startGame();
      } else if (screen === SCREEN_PAUSED && (actions & ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }

    if (screen === SCREEN_TITLE) {
      world.attract(frameSeconds);
    } else if (screen === SCREEN_LEVEL) {
      bannerLeft -= frameSeconds;
      world.attract(frameSeconds);
      if (bannerLeft <= 0) {
        screen = SCREEN_PLAY;
        announce(`Level ${pendingLevel}. ${world.state.shardsLeft} shards.`);
      }
    } else if (screen === SCREEN_PLAY) {
      accumulator += frameSeconds;
      let dash = dashPressed;
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        const events = world.step(STEP, readControl(dash));
        dash = false;
        accumulator -= STEP;
        handleEvents(events);
      }
      if (screen !== SCREEN_PLAY) accumulator = 0;
    } else {
      accumulator = 0;
    }

    renderer.draw(world.state, screen, best, audio.muted);
  }

  // Leaving the tab pauses a running game rather than letting the timer drain unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  world.reset();
  announce('Lumen Drift. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
