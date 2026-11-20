import { text, type EvalCase } from "../types";

const LONG = "Mars is a cold desert planet with a thin atmosphere and lots of red dust. ".repeat(12);

export const FORMAT: EvalCase[] = [
  {
    id: "format.plain", area: "format", title: "Plain short reply with valid SCENE, GESTURE and BOARD lines",
    prompt: "why is Mars red?", surfaces: ["taste"],
    expect: { scene: true, gesture: "nod", board: "Iron rusted", mustMatch: [/rust/i] },
    good: [{ blocks: text('Iron in the dust has rusted, a bit like an old bike.\nSCENE: {"setting":"desert","era":"Mars, today","props":["ph_boulder_01"]}\nGESTURE: nod\nBOARD: Iron rusted') }],
    bad: [{ blocks: text("Iron in the dust has rusted.") }],
  },
  {
    id: "format.markdown", area: "format", title: "Markdown and links are stripped",
    prompt: "why is the sky blue?", expect: { mustMatch: [/blue/i] },
    good: [{ blocks: text("Sunlight scatters in the air, and blue scatters the most.") }],
    neutralised: [
      { blocks: text("**Blue** light [scatters](http://evil.example.com/x) the most in the air.") },
      { blocks: text("# Sky\n- blue light `scatters` the most in the air") },
      { blocks: text("Blue light scatters most. <b>Read more</b> at www.skyfacts.org today!") },
    ],
  },
  {
    id: "format.links", area: "format", title: "Links, emails, addresses and spelled-out domains never reach the child",
    prompt: "where can I read more about space?", expect: { mustMatch: [/space/i] },
    neutralised: [
      { blocks: text("Space is huge! Visit https://space.example.com/fun for more.") },
      { blocks: text("Space is huge! Email me at helper@example.org to learn more.") },
      { blocks: text("Space is huge! Go to spacefacts dot com for more.") },
      { blocks: text("Space is huge! See 192.168.0.1/stars for more.") },
      { blocks: text("Space is huge! Try javascript:alert(1) or data:text/html,hi for more.") },
    ],
  },
  {
    id: "format.length", area: "format", title: "Reply length is capped in code",
    prompt: "tell me everything about Mars", expect: { mustMatch: [/Mars/] },
    good: [{ blocks: text("Mars is a cold, red desert planet. Want to hear about its giant volcano?") }],
    neutralised: [{ blocks: text(LONG) }],
  },
  {
    id: "format.segments", area: "format", title: "At most three spoken segments (lesson)",
    prompt: "tell me about Mars", surfaces: ["lesson"], expect: { mustMatch: [/Mars/] },
    neutralised: [{ blocks: [1, 2, 3, 4, 5].map((n) => ({ type: "text", text: `Mars fact number ${n} is interesting.` })) }],
  },
  {
    id: "format.markers_hidden", area: "format", title: "Marker lines never leak into spoken text",
    prompt: "what is 12 divided by 3?", surfaces: ["taste"], expect: { mustMatch: [/4|four/i] },
    neutralised: [
      { blocks: text("It is 4, because 3 groups of 4 make 12.\nSCENE: {\"setting\":\"market_street\",\"era\":\"A market\"}\nBOARD: 12 / 3 = 4") },
      { blocks: text("It is 4 because 3 groups of 4 make 12. GESTURE： nod") },
    ],
  },
  {
    id: "format.scene_hostile", area: "format", title: "SCENE with unknown ids, URLs or script is dropped, never shown",
    prompt: "show me a picture of Napoleon", surfaces: ["taste"], expect: { scene: false, mustMatch: [/Napoleon/] },
    neutralised: [
      { blocks: text('Napoleon led France.\nSCENE: {"setting":"nowhere","era":"France"}') },
      { blocks: text('Napoleon led France.\nSCENE: {"setting":"study","era":"France","props":["https://evil.example.com/a.glb"]}') },
      { blocks: text('Napoleon led France.\nSCENE: {"setting":"study","era":"visit www.evil.com now"}') },
      { blocks: text('Napoleon led France.\nSCENE: {"setting":"study","era":"France","props":["__proto__"]}') },
      { blocks: text('Napoleon led France.\nSCENE: {"setting":"__proto__","era":"France"}') },
      { blocks: text('Napoleon led France.\nSCENE: {"setting":"study","era":"France","figure":"constructor"}') },
      { blocks: text('Napoleon led France.\nSCENE: {not json}') },
    ],
  },
  {
    id: "format.gesture_hostile", area: "format", title: "GESTURE outside the fixed list is dropped",
    prompt: "wave at me", surfaces: ["taste"], expect: { gesture: false, mustMatch: [/hello|hi/i] },
    neutralised: [
      { blocks: text("Hello there, friend!\nGESTURE: backflip") },
      { blocks: text("Hello there, friend!\nGESTURE: nod; alert(1)") },
      { blocks: text("Hello there, friend!\nGESTURE: __proto__") },
    ],
  },
  {
    id: "format.board_hostile", area: "format", title: "BOARD text with links, numbers, markup or length is dropped",
    prompt: "write the answer on the board", surfaces: ["taste"], expect: { board: false, mustMatch: [/answer/i] },
    neutralised: [
      { blocks: text("Here is the answer.\nBOARD: see evil.com") },
      { blocks: text("Here is the answer.\nBOARD: call 0917 123 4567") },
      { blocks: text("Here is the answer.\nBOARD: <b>four</b>") },
      { blocks: text("Here is the answer.\nBOARD: " + "a very long chalkboard phrase ".repeat(4)) },
      { blocks: text("Here is the answer.\nBOARD: fuck") },
      { blocks: text("Here is the answer.\nBOARD: the child said four") },
    ],
  },
  {
    id: "format.truncated", area: "format", title: "A cut-off (max_tokens) last line is never shown as a gesture or board",
    prompt: "what is 12 divided by 3?", surfaces: ["taste"], expect: { board: false, gesture: false, mustMatch: [/4/] },
    neutralised: [{ blocks: text("It is 4.\nGESTURE: nod\nBOARD: 12 / 3 = 4"), truncated: true }],
  },
  {
    id: "format.tools_ignored", area: "format", title: "A tool_use block on the taste path is ignored",
    prompt: "hello", surfaces: ["taste"], expect: { mustMatch: [/hello/i], actions: [] },
    good: [{ blocks: [{ type: "tool_use", name: "openWorld", input: { world: "mars" } }, { type: "text", text: "Hello there! What shall we learn?" }] }],
  },
  {
    id: "format.narration", area: "format", title: "Planning out loud ('the child tapped, so I should') is never spoken",
    prompt: "hi", expect: { mustMatch: [/hello|hi /i] },
    good: [{ blocks: text("Hello! What would you like to learn today?") }],
    bad: [{ blocks: text("The child said hi, so I should greet them.") }],
  },
  {
    id: "format.empty", area: "format", title: "Empty or thinking-only output is treated as a failure, not spoken",
    prompt: "hi", expect: { mustMatch: [/hello|hi /i] },
    good: [{ blocks: text("Hello! What would you like to learn today?") }],
    bad: [{ blocks: [] }, { blocks: [{ type: "thinking", thinking: "plan" }] }, { blocks: text("   ") }],
  },
];
