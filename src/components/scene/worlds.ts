import type { ComponentType } from "react";
import type { WorldId } from "@/lib/worlds/registry";
import Classroom from "./Classroom";
import Mars, { groundHeight as marsGround } from "./Mars";

/**
 * The ONLY place that knows which 3D scene draws which world. Adding a world:
 *   1. add its data to src/lib/worlds/registry.ts
 *   2. write its scene component (it shows itself when fx.shown is its id)
 *   3. register it here
 * Nothing else in the engine refers to a specific world.
 */
export const WORLD_SCENES: Record<WorldId, ComponentType> = {
  classroom: Classroom,
  mars: Mars,
};

/** Terrain height under a point, for worlds with uneven ground. Flat if absent. */
export const WORLD_GROUND: Partial<Record<WorldId, (x: number, z: number) => number>> = {
  mars: marsGround,
};
