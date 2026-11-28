import type { TeacherId } from "@/lib/teacher/rig";

/**
 * The greeting a tutor says right after the visitor picks them. Fixed text, never a model call, never a try.
 * The caption always shows it. Sound has two sources, in this order:
 *  1. A RECORDED file (below), generated 28 Nov 2026 (ASSET_LICENSES.md row). Same-origin, free, nothing sent anywhere.
 *  2. The free browser voice, only after a grown-up has switched voice on (the existing gate).
 * Honest label: a recorded greeting is "recorded, not live voice"; nothing is claimed when no file plays.
 */
export const GREETING_AUDIO: Record<TeacherId, string | null> = {
  leo: "/audio/greeting-leo.mp3", // one-line swap if the founder hears the voices the other way round
  mia: "/audio/greeting-mia.mp3",
};
export const greetingLine = (name: string) => `Hi, I'm ${name}! What do you want to learn today?`;

/** Examples that rotate in the empty box. Each is a question the landing tutor can answer in a sentence or two. */
export const PLACEHOLDERS = [
  "Why is the sky blue?",
  "What's tricky in your homework?",
  "Why can I see the Moon in the day?",
  "How do I explain division to my kid?",
  "Quiz me on fractions",
] as const;
