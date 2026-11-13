/**
 * Which brain this build can use. A build-time switch, not a secret.
 * Scripted builds must never say the teacher is an AI: the words on screen and
 * the spoken lines have to match the badge ("Scripted · not AI").
 */
export const MODEL_BUILD = process.env.NEXT_PUBLIC_BRAIN === "model";
