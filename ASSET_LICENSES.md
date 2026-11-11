# Asset and source licenses

| Asset / source | Where | Origin | License | Commercial use |
|---|---|---|---|---|
| Teacher "Leo" (procedural body) | src/lib/teacher/rig.ts | Written for this project | Owned | Yes |
| Classroom, desk, shelf, board, windows | src/components/Stage.tsx | Written for this project | Owned | Yes |
| Mars globe texture (procedural, illustrative, not a real map) | src/components/Stage.tsx | Written for this project | Owned | Yes |
| Mars fact set | src/lib/knowledge/mars.ts | Paraphrased facts; source NASA Space Place https://spaceplace.nasa.gov/all-about-mars/en/ | Facts; NASA content generally public domain — verify page terms before quoting text/images | Yes (facts) |
| npm dependencies (next, react, three, @react-three/fiber, zustand) | package.json | npm | MIT | Yes |
| Browser speech synthesis voice (demo mode only) | runtime | User's browser/OS | n/a — not shipped | Demo only |
| OpenAI Realtime voices (live mode) | runtime | OpenAI API | OpenAI terms — verify child-directed use terms before real-child testing | Verify |

## Reference-only material — NOT in this repo, never ship
| Item | License | Note |
|---|---|---|
| Concept video avatar (Ready Player Me via met4citizen/TalkingHead) | CC BY-NC 4.0 | Non-commercial. Do not extract or reuse. |
| Concept video Mars globe texture (Solar System Scope) | CC BY 4.0 | Usable with credit, but not used here. |
| TEACHER_DUO_REFERENCE.png | AI-generated concept art for this project | Visual direction only; not a rigged asset. |

Rule: nothing gets added to `public/` or the bundle without a row here first.
