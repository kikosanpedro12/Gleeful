/**
 * Worlds are DATA. A world declares where the teacher can stand, what can be
 * pointed at or tapped, which questions it can ask, its facts and sources, and
 * how to travel there. The renderer maps a world's `environment` to a prepared
 * scene component; the brain (scripted now, Claude later) can only reference
 * ids declared here. Adding a subject = adding a world entry + (if needed) a
 * new reusable environment. Nothing here is executable.
 */
export type WorldId = "classroom" | "mars";
export type Environment = "classroom" | "planet_surface";
/** How the camera frames a world: indoors (close) or outdoors (higher, wider). */
export type Framing = "indoor" | "outdoor";
export type Transit = "space_flight" | "fade";

export interface Source { id: string; title: string; url: string; note?: string }
export interface Fact { id: string; text: string; sourceId: string }
export interface QuestionOption { id: string; label: string; correct: boolean; keywords: string[] }
export interface Question { id: string; skill: string; prompt: string; options: QuestionOption[]; hint: string; explain: string }
export interface Interactive { label: string; inspect: { title: string; body: string; factIds: string[]; hint?: string } }

export interface WorldDef {
  id: WorldId;
  title: string;
  subject: string;
  /** Shown on screen while inside the world. Required for anything simulated. */
  simulationNotice?: string;
  environment: Environment;
  framing: Framing;
  /** Background colour behind the world (also the travel flash colour). */
  background: string;
  /** Texture key for the planet seen while flying here (space_flight only). */
  planet?: "mars";
  /** How to arrive here from the hub. */
  transit: Transit;
  /** The teacher wears a space helmet here (honesty: no unprotected humans in space). */
  helmet: boolean;
  arrivalSpot: string;
  spots: Record<string, [x: number, z: number]>;
  /** Things the teacher may point at. Positions are live (from the scene); labels are for the brain. */
  targets: Record<string, string>;
  interactive: Record<string, Interactive>;
  questions: Record<string, Question>;
  facts: Fact[];
  sources: Source[];
  reviewStatus: "pending human review" | "reviewed";
}

const NASA_MARS: Source = { id: "nasa_spaceplace_mars", title: "All About Mars — NASA Space Place", url: "https://spaceplace.nasa.gov/all-about-mars/en/" };

export const WORLDS: Record<WorldId, WorldDef> = {
  classroom: {
    id: "classroom",
    title: "Classroom",
    subject: "hub",
    environment: "classroom",
    framing: "indoor",
    background: "#f3e7d3",
    transit: "fade",
    helmet: false,
    arrivalSpot: "center",
    spots: { center: [-0.15, -0.7], board_side: [-1.35, -1.75], desk_side: [0.95, -0.9] },
    targets: { board: "the classroom board", mars_globe: "a small Mars globe on the desk", bookshelf: "the bookshelf", window: "the window" },
    interactive: {},
    questions: {
      q_red_recall: {
        id: "q_red_recall", skill: "science.mars.red_color",
        prompt: "Quick check, no hints: what makes Mars look red?",
        options: [
          { id: "fire", label: "Lots of fire", correct: false, keywords: ["fire", "burn", "lava", "hot"] },
          { id: "rust", label: "Iron that has rusted", correct: true, keywords: ["rust", "iron", "oxid"] },
          { id: "paint", label: "Red dust from rovers", correct: false, keywords: ["rover", "paint", "robot"] },
        ],
        hint: "", // later checks are deliberately unassisted
        explain: "Mars looks red because iron in its rocks and dust has rusted.",
      },
    },
    facts: [],
    sources: [],
    reviewStatus: "pending human review",
  },
  mars: {
    id: "mars",
    title: "Mars",
    subject: "science",
    simulationNotice: "Virtual field trip · a simulation, not real Mars",
    environment: "planet_surface",
    framing: "outdoor",
    background: "#d8a47e",
    planet: "mars",
    transit: "space_flight",
    helmet: true,
    arrivalSpot: "landing",
    spots: { landing: [0, 0], rock_side: [0.55, -0.55], crater_edge: [-2.9, -4.9], mountain_view: [3.0, -4.2] },
    targets: { rock_1: "a reddish rock near you", crater: "a crater", mountain: "Olympus Mons, a giant volcano far away", ground: "the red dusty ground", sky: "the Martian sky" },
    interactive: {
      rock_1: {
        label: "Rock",
        inspect: {
          title: "Rusty iron minerals",
          body: "This rock and its dust contain iron. Over a very long time the iron rusted, which gives Mars its reddish colour.",
          factIds: ["red"],
          hint: "Drag the rock to spin it.",
        },
      },
    },
    questions: {
      q_red: {
        id: "q_red", skill: "science.mars.red_color",
        prompt: "So, why do you think Mars looks red?",
        options: [
          { id: "hot", label: "Because it is very hot", correct: false, keywords: ["hot", "heat", "fire", "burn"] },
          { id: "rust", label: "Because iron has rusted", correct: true, keywords: ["rust", "iron", "oxid"] },
          { id: "sun", label: "Because the Sun paints it", correct: false, keywords: ["sun", "light", "paint"] },
        ],
        hint: "Mars is actually very cold. Think about what happens to an iron bike left out in the rain.",
        explain: "Mars looks red because iron in its rocks and dust has rusted, a bit like an old bike left in the rain.",
      },
    },
    facts: [
      { id: "fourth", text: "Mars is the fourth planet from the Sun.", sourceId: NASA_MARS.id },
      { id: "red", text: "Mars looks red because iron minerals in its rocks and dust have rusted (oxidised).", sourceId: NASA_MARS.id },
      { id: "air", text: "Mars has a very thin atmosphere, mostly carbon dioxide. People could not breathe there and would need spacesuits.", sourceId: NASA_MARS.id },
      { id: "cold", text: "Mars is a cold desert planet.", sourceId: NASA_MARS.id },
      { id: "visitors", text: "Only robots, such as rovers, have visited Mars so far.", sourceId: NASA_MARS.id },
      { id: "volcano", text: "Mars has the largest volcano in the solar system, Olympus Mons. Mars's volcanoes are not active now.", sourceId: NASA_MARS.id },
      { id: "craters", text: "Craters on Mars were made when space rocks crashed into its surface.", sourceId: NASA_MARS.id },
    ],
    sources: [NASA_MARS],
    reviewStatus: "pending human review",
  },
};

export const WORLD_IDS = Object.keys(WORLDS) as WorldId[];
export const isWorldId = (v: unknown): v is WorldId => typeof v === "string" && (WORLD_IDS as string[]).includes(v);

/** While flying between worlds only the destination planet can be pointed at. */
export const TRANSIT_TARGETS = { destination: "the planet we are flying to" };

export interface CommandContext {
  world: WorldId | "transit";
  targets: string[];
  spots: string[];
  interactive: string[];
  questions: string[];
}

export function contextFor(world: WorldId | "transit"): CommandContext {
  if (world === "transit") return { world, targets: Object.keys(TRANSIT_TARGETS), spots: [], interactive: [], questions: [] };
  const w = WORLDS[world];
  return {
    world,
    targets: Object.keys(w.targets),
    spots: Object.keys(w.spots),
    interactive: Object.keys(w.interactive),
    questions: Object.keys(w.questions),
  };
}
