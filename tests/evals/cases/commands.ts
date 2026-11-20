import { WORLDS, WORLD_IDS } from "@/lib/worlds/registry";
import { GESTURES } from "@/lib/scene/commands";
import type { CommandCase } from "../types";

const HOSTILE_IDS: [string, unknown][] = [
  ["proto", "__proto__"], ["constructor", "constructor"], ["toString", "toString"], ["hasOwnProperty", "hasOwnProperty"],
  ["path traversal", "../../etc/passwd"], ["url", "https://evil.example.com/a.glb"], ["javascript url", "javascript:alert(1)"],
  ["leading space", " rock_1"], ["upper case", "ROCK_1"], ["trailing nul", "rock_1\u0000"], ["number", 123], ["null", null],
  ["array", ["rock_1"]], ["object", { id: "rock_1" }], ["empty", ""], ["huge", "a".repeat(10_000)], ["bidi", "rock_1‮"],
];

/** Hand-written cases: hostile ids and wrong-world ids must be rejected. */
const HAND: CommandCase[] = [];
for (const [label, v] of HOSTILE_IDS) {
  HAND.push({ id: `cmd.pointAt.${label}`, title: `pointAt rejects ${label}`, world: "mars", name: "pointAt", args: { target: v }, ok: false });
  HAND.push({ id: `cmd.moveTeacherTo.${label}`, title: `moveTeacherTo rejects ${label}`, world: "mars", name: "moveTeacherTo", args: { spot: v }, ok: false });
  HAND.push({ id: `cmd.inviteTap.${label}`, title: `inviteTap rejects ${label}`, world: "mars", name: "inviteTap", args: { target: v }, ok: false });
  HAND.push({ id: `cmd.askQuestion.${label}`, title: `askQuestion rejects ${label}`, world: "market", name: "askQuestion", args: { questionId: v }, ok: false });
  HAND.push({ id: `cmd.openWorld.${label}`, title: `openWorld rejects ${label}`, world: "classroom", name: "openWorld", args: { world: v }, ok: false });
}
HAND.push(
  { id: "cmd.wrong_world.pointAt", title: "a classroom target is not valid on Mars", world: "mars", name: "pointAt", args: { target: "bookshelf" }, ok: false },
  { id: "cmd.wrong_world.inviteTap", title: "Mars rock is not tappable in the market", world: "market", name: "inviteTap", args: { target: "rock_1" }, ok: false },
  { id: "cmd.wrong_world.question", title: "q_red is not askable in the market", world: "market", name: "askQuestion", args: { questionId: "q_red" }, ok: false },
  { id: "cmd.board_not_in_mars", title: "no chalkboard on Mars", world: "mars", name: "writeOnBoard", args: { text: "hi" }, ok: false },
  { id: "cmd.board_empty", title: "empty board text", world: "classroom", name: "writeOnBoard", args: { text: "   " }, ok: false },
  { id: "cmd.board_not_string", title: "board text must be a string", world: "classroom", name: "writeOnBoard", args: { text: { a: 1 } }, ok: false },
  { id: "cmd.openWorld.self", title: "cannot open the world you are in", world: "mars", name: "openWorld", args: { world: "mars" }, ok: false },
  { id: "cmd.openWorld.transit", title: "cannot open a world while travelling", world: "transit", name: "openWorld", args: { world: "mars" }, ok: false },
  { id: "cmd.widget.transit", title: "no widgets while travelling", world: "transit", name: "showWidget", args: { widget: "number_line", min: 0, max: 10, step: 1, format: "integer" }, ok: false },
  { id: "cmd.widget.unknown_kind", title: "unknown widget kind", world: "market", name: "showWidget", args: { widget: "iframe", src: "https://evil.example.com" }, ok: false },
  { id: "cmd.widget.too_many_ticks", title: "number line with 1000 ticks", world: "market", name: "showWidget", args: { widget: "number_line", min: 0, max: 1000, step: 1, format: "integer" }, ok: false },
  { id: "cmd.scene.transit", title: "no scene while travelling", world: "transit", name: "showScene", args: { setting: "study", era: "x" }, ok: false },
  { id: "cmd.scene.unknown_setting", title: "unknown scene setting", world: "mars", name: "showScene", args: { setting: "__proto__", era: "x" }, ok: false },
  { id: "cmd.scene.unknown_prop", title: "unknown scene prop", world: "mars", name: "showScene", args: { setting: "study", era: "x", props: ["../x.glb"] }, ok: false },
  { id: "cmd.scene.too_many_props", title: "more than 6 props", world: "mars", name: "showScene", args: { setting: "study", era: "x", props: Array(7).fill("ph_boulder_01") }, ok: false },
  { id: "cmd.scene.unknown_figure", title: "unknown figure id", world: "mars", name: "showScene", args: { setting: "study", era: "x", figure: "constructor" }, ok: false },
  { id: "cmd.choices.none", title: "offerChoices with no choices", world: "mars", name: "offerChoices", args: { choices: [] }, ok: false },
  { id: "cmd.choices.five", title: "offerChoices with 5 choices", world: "mars", name: "offerChoices", args: { choices: [1, 2, 3, 4, 5].map((n) => ({ id: `c${n}`, label: `C${n}` })) }, ok: false },
  { id: "cmd.choices.bad_id", title: "offerChoices id with spaces/caps", world: "mars", name: "offerChoices", args: { choices: [{ id: "Bad Id", label: "x" }] }, ok: false },
  { id: "cmd.choices.proto_id", title: "offerChoices id __proto__-like is data only, never a key (id charset)", world: "mars", name: "offerChoices", args: { choices: [{ id: "__proto__!", label: "x" }] }, ok: false },
  { id: "cmd.name.unknown", title: "unknown command name", world: "mars", name: "eval", args: { code: "1" }, ok: false },
  { id: "cmd.name.proto", title: "__proto__ as command name", world: "mars", name: "__proto__", args: {}, ok: false },
  { id: "cmd.name.not_string", title: "command name not a string", world: "mars", name: 7, args: {}, ok: false },
  { id: "cmd.args.not_object", title: "arguments not an object", world: "mars", name: "gesture", args: "wave", ok: false },
  { id: "cmd.args.array", title: "arguments an array", world: "mars", name: "gesture", args: ["wave"], ok: false },
  { id: "cmd.gesture.unknown", title: "gesture outside the fixed list", world: "mars", name: "gesture", args: { gesture: "backflip" }, ok: false },
  { id: "cmd.raw.bad_json", title: "tool call with invalid JSON", world: "mars", name: "gesture", args: "{not json", ok: false },
  { id: "cmd.raw.null", title: "tool call whose arguments are null", world: "mars", name: "gesture", args: "null", ok: false },
  { id: "cmd.raw.array", title: "tool call whose arguments are an array", world: "mars", name: "gesture", args: "[]", ok: false },
  { id: "cmd.raw.proto_json", title: "JSON with a __proto__ key does not pass an id", world: "mars", name: "pointAt", args: '{"__proto__":{"target":"rock_1"}}', ok: false },
);

/** Valid commands, generated from the registry so a new world is covered automatically. */
const VALID: CommandCase[] = [];
for (const g of GESTURES) VALID.push({ id: `cmd.valid.gesture.${g}`, title: `gesture ${g}`, world: "mars", name: "gesture", args: { gesture: g }, ok: true });
for (const id of WORLD_IDS) {
  const w = WORLDS[id];
  for (const t of Object.keys(w.targets)) VALID.push({ id: `cmd.valid.${id}.pointAt.${t}`, title: `${id}: pointAt ${t}`, world: id, name: "pointAt", args: { target: t }, ok: true });
  for (const s of Object.keys(w.spots)) VALID.push({ id: `cmd.valid.${id}.moveTeacherTo.${s}`, title: `${id}: moveTeacherTo ${s}`, world: id, name: "moveTeacherTo", args: { spot: s }, ok: true });
  for (const t of Object.keys(w.interactive)) VALID.push({ id: `cmd.valid.${id}.inviteTap.${t}`, title: `${id}: inviteTap ${t}`, world: id, name: "inviteTap", args: { target: t }, ok: true });
  for (const q of Object.keys(w.questions)) VALID.push({ id: `cmd.valid.${id}.askQuestion.${q}`, title: `${id}: askQuestion ${q}`, world: id, name: "askQuestion", args: { questionId: q }, ok: true });
  for (const o of WORLD_IDS.filter((x) => x !== id)) VALID.push({ id: `cmd.valid.${id}.openWorld.${o}`, title: `${id}: openWorld ${o}`, world: id, name: "openWorld", args: { world: o }, ok: true });
}
VALID.push(
  { id: "cmd.valid.board", title: "board text in the classroom", world: "classroom", name: "writeOnBoard", args: { text: "Iron rusted" }, ok: true },
  { id: "cmd.valid.choices", title: "1-4 choices", world: "mars", name: "offerChoices", args: { choices: [{ id: "a", label: "Rock" }, { id: "b", label: "Crater" }] }, ok: true },
  { id: "cmd.valid.scene", title: "a valid scene", world: "mars", name: "showScene", args: { setting: "desert", era: "Mars, today", props: ["ph_boulder_01"] }, ok: true },
  { id: "cmd.valid.widget", title: "a valid number line", world: "market", name: "showWidget", args: { widget: "number_line", min: 0, max: 10, step: 1, format: "integer" }, ok: true },
  { id: "cmd.valid.raw", title: "tool call from valid JSON", world: "mars", name: "gesture", args: '{"gesture":"nod"}', ok: true },
  { id: "cmd.valid.hide", title: "hideWidget and hideScene", world: "mars", name: "hideWidget", args: {}, ok: true },
);

export const COMMAND_CASES: CommandCase[] = [...HAND, ...VALID];
