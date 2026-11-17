/**
 * ElevenLabs live voice: the parts the browser may know (no secrets, no voice ids). The browser names a TEACHER
 * ("leo" or "mia"); the server maps that to a voice id it holds. The browser cannot pick a voice, a model, an
 * output format or an endpoint.
 */
export const ELEVEN_ENDPOINT = "/api/voice";
export const ELEVEN_TEACHERS = ["leo", "mia"] as const;
export type ElevenTeacher = (typeof ELEVEN_TEACHERS)[number];
export const isElevenTeacher = (v: unknown): v is ElevenTeacher => typeof v === "string" && (ELEVEN_TEACHERS as readonly string[]).includes(v);
export const ELEVEN_MAX_CHARS = 300;
/** The server asks ElevenLabs for raw 16-bit little-endian mono PCM at this rate (Creator plan allows it). */
export const ELEVEN_SAMPLE_RATE = 24_000;
export const ELEVEN_RATE_HEADER = "x-sample-rate";
