// Shared by scripts/build-characters.mjs and tests/characters.test.ts (no side effects here).
export const CAPS = { character: 900 * 1024, clips: 1200 * 1024 };

/**
 * What to keep of each source clip. start/end in source seconds (a long clip is cut to the part we play).
 * flattenRise: remove the net climb/fall of the hips (the clip was made to travel up a ladder; we climb in place).
 */
export const CLIPS = {
  idle: { start: 0, end: 15.3 },
  walk: {},
  run: {},
  jump: {},
  jump_down: {},
  run_upstairs: {},
  sit: { start: 0, end: 4 },
  look_around: { start: 0, end: 8 },
  bow: {},
  swim: { start: 0, end: 4.6 },
  laugh_01: {},
  greet_01: {},
  cheer: { start: 0, end: 5 },
  agree: {},
  climb: { flattenRise: true },
  clap: { start: 0, end: 5 },
  wave_goodbye_01: { start: 0, end: 5 },
};
