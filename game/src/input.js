// Keyboard and mouse input. Held keys give a thrust direction; the mouse, while held, aims
// thrust at the pointer instead. One-shot actions (confirm, pause, mute, dash) are latched as
// bits and consumed by the game loop, so a press between frames is never lost.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;

const KEY_DIRECTIONS = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

/** Create the input reader bound to a canvas. */
export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let dashQueued = false;
  let pointerDown = false;
  let pointerX = 0;
  let pointerY = 0;

  function latch(code) {
    if (code === 'Enter' || code === 'NumpadEnter') actions |= ACTION_CONFIRM;
    if (code === 'KeyP' || code === 'Escape') actions |= ACTION_PAUSE;
    if (code === 'KeyM') actions |= ACTION_MUTE;
    if (code === 'Space' || code === 'ShiftLeft' || code === 'ShiftRight') dashQueued = true;
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) {
      if (KEY_DIRECTIONS[event.code] || event.code === 'Space') event.preventDefault();
      return;
    }
    if (KEY_DIRECTIONS[event.code]) {
      held.add(event.code);
      event.preventDefault();
    }
    if (event.code === 'Space') event.preventDefault();
    latch(event.code);
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
    pointerDown = false;
  });

  /** Pointer position in the game's logical coordinates (the canvas is CSS-scaled). */
  function toGameCoords(event) {
    const rect = canvas.getBoundingClientRect();
    pointerX = ((event.clientX - rect.left) / rect.width) * canvas.width;
    pointerY = ((event.clientY - rect.top) / rect.height) * canvas.height;
  }

  canvas.addEventListener('pointerdown', (event) => {
    toGameCoords(event);
    if (event.button === 2) {
      dashQueued = true;
      return;
    }
    pointerDown = true;
    actions |= ACTION_CONFIRM;
  });
  canvas.addEventListener('pointermove', toGameCoords);
  window.addEventListener('pointerup', () => {
    pointerDown = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    /** The keyboard thrust direction, each axis in -1..1 (not normalized). */
    direction() {
      let x = 0;
      let y = 0;
      for (const code of held) {
        const dir = KEY_DIRECTIONS[code];
        if (dir) {
          x += dir[0];
          y += dir[1];
        }
      }
      return { x, y };
    },
    /** The mouse state: whether it is held, and where it points in game coordinates. */
    pointer() {
      return { down: pointerDown, x: pointerX, y: pointerY };
    },
    /** Consume the dash request latched since the last call. */
    takeDash() {
      const was = dashQueued;
      dashQueued = false;
      return was;
    },
    /** Consume the one-shot action bits latched since the last call. */
    takeActions() {
      const was = actions;
      actions = 0;
      return was;
    },
  };
}
