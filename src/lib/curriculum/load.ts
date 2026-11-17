import type { Framework, Standard } from "./types";

// Loaded on demand so ~1 MB of standards never ships in the client bundle of the lesson app.
const loaders: Record<Framework, () => Promise<{ default: Standard[] }>> = {
  "ccss-math": () => import("./data/ccss-math.json") as unknown as Promise<{ default: Standard[] }>,
  "ccss-ela": () => import("./data/ccss-ela.json") as unknown as Promise<{ default: Standard[] }>,
  ngss: () => import("./data/ngss.json") as unknown as Promise<{ default: Standard[] }>,
  "deped-matatag": () => import("./data/deped-matatag.json") as unknown as Promise<{ default: Standard[] }>,
};

export async function loadFramework(fw: Framework): Promise<Standard[]> {
  const load = Object.hasOwn(loaders, fw) ? loaders[fw] : undefined;
  if (!load) return [];
  return (await load()).default;
}

export async function loadAll(): Promise<Standard[]> {
  const parts = await Promise.all((Object.keys(loaders) as Framework[]).map(loadFramework));
  return parts.flat();
}
