// A tiny seeded random generator (mulberry32): the same seed always grows the same cavern,
// which is what makes the screenshot scenes reproducible.

/** Create a generator from a 32-bit seed; call it like Math.random for a float in [0, 1). */
export function createRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** A float in [min, max) from a generator made by createRandom. */
export function range(random, min, max) {
  return min + random() * (max - min);
}

/** An integer in [min, max] (both ends included) from a generator made by createRandom. */
export function intRange(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

/** One element of a non-empty array, chosen by a generator made by createRandom. */
export function pick(random, items) {
  return items[Math.floor(random() * items.length)];
}
