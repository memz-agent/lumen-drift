// Procedural sound with the Web Audio API: every effect is synthesized (oscillator blips and
// filtered noise), and a quiet pentatonic arpeggio loops as music. No audio files exist. The
// context is created lazily on the first user gesture, as browsers require, and M mutes all.

/** The music's scale: A minor pentatonic, two octaves of arpeggio plus a soft root bass. */
const ARP_NOTES = [220, 261.63, 329.63, 392, 440, 523.25, 659.25, 783.99];
const ARP_PATTERN = [0, 2, 4, 3, 5, 4, 6, 4, 7, 5, 4, 2, 3, 1, 2, 0];
const BASS_NOTES = [110, 87.31, 130.81, 98]; // A, F, C, G roots, one per bar
const STEP_SECONDS = 0.21;

/** Create the sound engine. Nothing sounds until unlock() runs inside a user gesture. */
export function createAudio() {
  let context = null;
  let master = null;
  let musicGain = null;
  let muted = false;
  let musicTimer = null;
  let nextNoteTime = 0;
  let stepIndex = 0;

  function unlock() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return;
    }
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    context = new AudioCtor();
    master = context.createGain();
    master.gain.value = muted ? 0 : 0.55;
    master.connect(context.destination);
    musicGain = context.createGain();
    musicGain.gain.value = 0.16;
    musicGain.connect(master);
    startMusic();
  }

  /** One enveloped oscillator note. */
  function tone({ freq, freqEnd = null, type = 'sine', at = 0, dur = 0.15, gain = 0.2, dest = null }) {
    if (!context) return;
    const t0 = context.currentTime + at;
    const osc = context.createOscillator();
    const env = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(gain, t0 + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(env).connect(dest ?? master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /** One burst of filtered noise (explosions, dash whoosh, wall thud). */
  function noise({ at = 0, dur = 0.2, gain = 0.25, from = 3000, to = 300 }) {
    if (!context) return;
    const t0 = context.currentTime + at;
    const length = Math.max(1, Math.floor(context.sampleRate * dur));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(from, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(30, to), t0 + dur);
    const env = context.createGain();
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    source.connect(filter).connect(env).connect(master);
    source.start(t0);
  }

  /** Schedule the arpeggio a little ahead of the clock, forever, while the context lives. */
  function startMusic() {
    nextNoteTime = context.currentTime + 0.1;
    stepIndex = 0;
    musicTimer = window.setInterval(() => {
      if (!context) return;
      while (nextNoteTime < context.currentTime + 0.3) {
        const at = nextNoteTime - context.currentTime;
        const note = ARP_NOTES[ARP_PATTERN[stepIndex % ARP_PATTERN.length]];
        tone({ freq: note, type: 'triangle', at, dur: 0.34, gain: 0.5, dest: musicGain });
        if (stepIndex % 8 === 0) {
          const bass = BASS_NOTES[Math.floor(stepIndex / 8) % BASS_NOTES.length];
          tone({ freq: bass, type: 'sine', at, dur: 1.4, gain: 0.9, dest: musicGain });
        }
        nextNoteTime += STEP_SECONDS;
        stepIndex += 1;
      }
    }, 110);
  }

  return {
    unlock,
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (master && context) master.gain.setTargetAtTime(muted ? 0 : 0.55, context.currentTime, 0.02);
      return muted;
    },
    /** Shard pickup: a bright blip that climbs with the current combo streak. */
    pickup(combo) {
      const base = 620 * Math.pow(1.059, Math.min(combo, 12));
      tone({ freq: base, freqEnd: base * 1.5, type: 'sine', dur: 0.14, gain: 0.22 });
      tone({ freq: base * 2, type: 'sine', at: 0.03, dur: 0.1, gain: 0.08 });
    },
    /** Losing a life: a noise burst and a falling low tone. */
    hit() {
      noise({ dur: 0.35, gain: 0.4, from: 2600, to: 120 });
      tone({ freq: 220, freqEnd: 46, type: 'sawtooth', dur: 0.4, gain: 0.22 });
    },
    /** Timer expiry: a duller, sadder fall than a mine hit. */
    timeUp() {
      tone({ freq: 392, freqEnd: 130, type: 'square', dur: 0.45, gain: 0.12 });
      tone({ freq: 196, freqEnd: 65, type: 'sine', at: 0.08, dur: 0.5, gain: 0.2 });
    },
    dash() {
      noise({ dur: 0.18, gain: 0.16, from: 900, to: 4200 });
    },
    /** A hard wall impact: a short low thud. */
    thud() {
      noise({ dur: 0.09, gain: 0.2, from: 500, to: 90 });
      tone({ freq: 90, freqEnd: 55, type: 'sine', dur: 0.1, gain: 0.25 });
    },
    /** Level clear: a quick rising arpeggio. */
    levelClear() {
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        tone({ freq, type: 'triangle', at: i * 0.07, dur: 0.22, gain: 0.2 });
      });
    },
    /** Game over: a slow descending line. */
    gameOver() {
      [440, 349.23, 261.63, 174.61].forEach((freq, i) => {
        tone({ freq, type: 'triangle', at: i * 0.16, dur: 0.34, gain: 0.2 });
      });
    },
    /** Menu confirm click. */
    ui() {
      tone({ freq: 740, freqEnd: 990, type: 'sine', dur: 0.08, gain: 0.14 });
    },
  };
}
