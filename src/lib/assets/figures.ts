/**
 * Real people are never drawn as 3D characters. A figure is a public-domain painting or photograph, shown on a card
 * with its credit. Each row needs a local file, the artist, the year, the licence and the source page. Empty on
 * purpose until each picture has been fetched, checked and added to ASSET_LICENSES.md (never hotlinked).
 */
export interface Figure {
  id: string;
  name: string;
  /** Local file under /public/assets/figures/ (never a remote URL). */
  file: string;
  /** Plain-text credit shown under the picture: artist, year. */
  credit: string;
  license: "public-domain";
  sourceUrl: string;
}
export const FIGURES: Figure[] = [];
export const figureById = new Map(FIGURES.map((f) => [f.id, f]));
