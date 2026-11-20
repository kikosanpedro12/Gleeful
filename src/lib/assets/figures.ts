/**
 * Real people in story pictures (decision, Kiko 19-21 Nov 2026): a 3D character is the primary way to show a
 * historical person. A credited portrait is kept in reserve for anyone we have no character for, and a plain name
 * card covers the rest (recent or living people, or anyone we have not made yet). The model only ever names a figure
 * id from this table; everything the child sees comes from here. Never hotlinked, never model-written.
 *
 * Tiers:
 * - "model": an AI-made 3D likeness (Tripo). Always shown with a note that it is a pretend likeness, not a photo.
 * - "portrait": a public-domain painting or photograph in /public/assets/figures/ with artist, year and source.
 * - "card": a name, years and one plain sentence. No picture of the person at all.
 * Every row needs its file (if any) and an ASSET_LICENSES.md row first. Blurbs are written by us and kept to
 * well-established facts.
 */
export type FigureTier = "model" | "portrait" | "card";

export interface Figure {
  id: string;
  name: string;
  /** e.g. "1769 to 1821". Plain text. */
  years: string;
  /** One plain sentence for a child. */
  blurb: string;
  /** Year they died (latest it could be). Only people long gone get a 3D character; anyone more recent is a name card. */
  diedBy: number;
  /** "documented": portraits or photos exist. "uncertain": nobody knows exactly what they looked like, and the card says so. */
  appearance: "documented" | "uncertain";
  tier: FigureTier;
  /** tier "model": file under /public/assets/ (a .glb in tripo/). */
  model?: string;
  /** Size of the model file in KB (counts toward the scene budget). */
  kb?: number;
  /** tier "portrait": file under /public/assets/figures/. */
  file?: string;
  /** tier "portrait": artist and year. */
  credit?: string;
  /** tier "portrait": source page. */
  sourceUrl?: string;
}

export const FIGURES: Figure[] = [
  { id: "napoleon", name: "Napoleon Bonaparte", years: "1769 to 1821", blurb: "A French army leader who became emperor of France.", diedBy: 1821, appearance: "documented", tier: "model", model: "tripo/napoleon.glb", kb: 1431 },
  { id: "jose_rizal", name: "José Rizal", years: "1861 to 1896", blurb: "A Filipino doctor, writer and national hero whose books helped awaken the wish for freedom from Spain.", diedBy: 1896, appearance: "documented", tier: "model", model: "tripo/rizal.glb", kb: 694 },
  { id: "bonifacio", name: "Andrés Bonifacio", years: "1863 to 1897", blurb: "A Filipino leader who founded the Katipunan, the group that began the fight for independence from Spain.", diedBy: 1897, appearance: "uncertain", tier: "model", model: "tripo/bonifacio.glb", kb: 1021 },
  { id: "lapu_lapu", name: "Lapu-Lapu", years: "1500s", blurb: "A chief of Mactan island in the Philippines who led his people against Magellan's men in 1521.", diedBy: 1600, appearance: "uncertain", tier: "model", model: "tripo/lapu-lapu.glb", kb: 1080 },
  { id: "magellan", name: "Ferdinand Magellan", years: "about 1480 to 1521", blurb: "A Portuguese explorer who led a fleet of Spanish ships across the Pacific and died in the Philippines.", diedBy: 1521, appearance: "uncertain", tier: "model", model: "tripo/magellan.glb", kb: 1110 },
  { id: "marie_curie", name: "Marie Curie", years: "1867 to 1934", blurb: "A scientist who studied radioactivity and was the first woman to win a Nobel Prize.", diedBy: 1934, appearance: "documented", tier: "model", model: "tripo/curie.glb", kb: 1056 },
  { id: "isaac_newton", name: "Isaac Newton", years: "1643 to 1727", blurb: "An English scientist who explained gravity and how things move.", diedBy: 1727, appearance: "documented", tier: "model", model: "tripo/newton.glb", kb: 1054 },
  // Name cards: no character yet (or a recent person). The brain still tells the story in words.
  { id: "stephen_hawking", name: "Stephen Hawking", years: "1942 to 2018", blurb: "An English scientist who studied black holes and how the universe began.", diedBy: 2018, appearance: "documented", tier: "card" },
  { id: "albert_einstein", name: "Albert Einstein", years: "1879 to 1955", blurb: "A scientist born in Germany who came up with the theory of relativity.", diedBy: 1955, appearance: "documented", tier: "card" },
  { id: "leonardo_da_vinci", name: "Leonardo da Vinci", years: "1452 to 1519", blurb: "An Italian artist and inventor who painted the Mona Lisa.", diedBy: 1519, appearance: "uncertain", tier: "card" },
];
export const figureById = new Map(FIGURES.map((f) => [f.id, f]));
