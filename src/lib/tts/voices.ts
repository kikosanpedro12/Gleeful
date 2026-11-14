/**
 * Deepgram Aura-2 voices the app may ask for. Client-safe (no secrets): the server only accepts ids from this list,
 * so the browser cannot pick any other model, endpoint or option.
 */
export const TTS_VOICES = [
  "aura-2-apollo-en", "aura-2-aries-en", "aura-2-arcas-en", "aura-2-atlas-en", "aura-2-mars-en", "aura-2-orion-en",
  "aura-2-amalthea-en", "aura-2-thalia-en", "aura-2-luna-en", "aura-2-aurora-en", "aura-2-iris-en", "aura-2-cordelia-en",
] as const;
export type TtsVoice = (typeof TTS_VOICES)[number];
export const isTtsVoice = (v: unknown): v is TtsVoice => typeof v === "string" && (TTS_VOICES as readonly string[]).includes(v);
export const TTS_ENDPOINT = "/api/tts";
export const TTS_MAX_CHARS = 300;
