/**
 * The landing hero is a "broadcast": each chapter is one episode the teacher
 * flies the visitor through while they scroll. Text lives in HTML (indexable,
 * readable without WebGL); the 3D stage only illustrates it.
 *
 * Honesty: every world after the classroom is a PREVIEW (tagged on screen) of
 * where Gleeful is going. Today's demo is one scripted lesson with one trip
 * (Mars); the page says so in the hero, on each preview and in the FAQ.
 */
export type ChapterId = "classroom" | "ocean" | "cell" | "dino" | "city" | "numbers" | "space";

export interface Chapter {
  id: ChapterId;
  /** Shown in the channel bug ("Now showing: …"). */
  episode: string;
  headline: string;
  strap: string;
  /** Page/fog colour while this chapter is on air, and the lower-third colours on top of it. */
  sky: string;
  ink: string;
  plate: string;
  plateInk: string;
  /** Subject label, for the "any subject" message. */
  subject: string;
  /** True when this world is only a picture of where Gleeful is going: the demo lesson does NOT contain it. */
  preview: boolean;
}

export const CHAPTERS: readonly Chapter[] = [
  {
    id: "classroom", episode: "The classroom", subject: "Meet your teacher", preview: false,
    headline: "An AI teacher your kid can talk to.",
    strap: "Gleeful is an AI teacher who answers out loud, then takes your child to see it. Early access: try the scripted demo today.",
    sky: "#FFB627", ink: "#14213D", plate: "#14213D", plateInk: "#FFFFFF",
  },
  {
    id: "ocean", episode: "Under the sea", subject: "Earth science", preview: true,
    headline: "Ask why the sea is salty. Then dive in.",
    strap: "Rivers carry tiny bits of salt into the ocean, and the sun takes back only the water.",
    sky: "#0B5E77", ink: "#FFFFFF", plate: "#FFB627", plateInk: "#14213D",
  },
  {
    id: "cell", episode: "Inside a leaf", subject: "Biology", preview: true,
    headline: "Ask how plants eat. Then shrink inside a leaf.",
    strap: "Little green parts called chloroplasts turn sunlight, air and water into food.",
    sky: "#2F7A3B", ink: "#FFFFFF", plate: "#FFFFFF", plateInk: "#14213D",
  },
  {
    id: "dino", episode: "Dinosaur valley", subject: "History of life", preview: true,
    headline: "Ask how big dinosaurs got. Then stand next to one.",
    strap: "The biggest long-necked dinosaurs were about as long as three school buses in a row.",
    sky: "#F08A4B", ink: "#14213D", plate: "#14213D", plateInk: "#FFFFFF",
  },
  {
    id: "city", episode: "The ancient city", subject: "History", preview: true,
    headline: "Ask how people built pyramids. Then walk the steps.",
    strap: "Thousands of skilled workers cut, hauled and stacked stone blocks over many years.",
    sky: "#E9B44C", ink: "#14213D", plate: "#FF5E8A", plateInk: "#14213D",
  },
  {
    id: "numbers", episode: "Fraction island", subject: "Maths", preview: true,
    headline: "Stuck on fractions? Slice them with your own hands.",
    strap: "Pull a pie apart, put it back together, and see why two quarters make a half.",
    sky: "#2B59C3", ink: "#FFFFFF", plate: "#FFB627", plateInk: "#14213D",
  },
  {
    id: "space", episode: "Out past the Moon", subject: "Space", preview: true,
    headline: "Where we're headed: any subject, kindergarten to grade 12.",
    strap: "Your child asks. The teacher shows. You see what they really learned.",
    sky: "#14213D", ink: "#FFFFFF", plate: "#FFB627", plateInk: "#14213D",
  },
];

/** Scroll progress 0..1 → fractional chapter index 0..N-1. */
export function chapterAt(progress: number, n = CHAPTERS.length): number {
  const p = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  return p * (n - 1);
}

/** Linear blend of two #RRGGBB colours. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const k = Math.min(1, Math.max(0, t));
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
}
