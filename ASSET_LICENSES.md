# Asset and source licenses

| Asset / source | Where | Origin | License | Commercial use |
|---|---|---|---|---|
| Teachers Leo + Mia (procedural bodies, outfits, helmet) | src/lib/teacher/rig.ts | Written for this project, styled after TEACHER_DUO_REFERENCE.png | Owned | Yes |
| Classroom, desk, shelf, board, windows, rug | src/components/scene/Classroom.tsx | Written for this project | Owned | Yes |
| Starfield, travel planet | src/components/scene/Space.tsx | Generated in code | Owned | Yes |
| Mars surface: terrain, crater, volcano, rocks, dust, sky | src/components/scene/Mars.tsx | Generated in code; illustrative, not a map of a real place | Owned | Yes |
| Mars globe/planet texture | drawMarsTexture() in src/components/scene/shared.tsx | Drawn in code; illustrative, not a real map | Owned | Yes |
| Mars facts + questions | src/lib/worlds/registry.ts | Paraphrased facts. Source: NASA Space Place https://spaceplace.nasa.gov/all-about-mars/en/ | Facts; NASA content generally public domain (verify page terms before reusing text or images) | Yes (facts) |
| npm dependencies (next, react, three, @react-three/fiber, zustand) | package.json | npm | MIT | Yes |
| Teacher voices | runtime | The user's browser / OS speech voices | Not shipped by us; device-dependent | Test only. Choose a licensed voice for production. |
| Speech recognition | runtime | Browser Web Speech API (Chrome sends audio to Google to transcribe) | Google / browser terms | Test only. Review before real-child use. |

## Reference-only material: NOT in this repo, never ship
| Item | License | Note |
|---|---|---|
| Concept video avatar (Ready Player Me via met4citizen/TalkingHead) | CC BY-NC 4.0 | Non-commercial. Do not extract or reuse. |
| Concept video Mars globe texture (Solar System Scope) | CC BY 4.0 | Usable with credit, but not used here. |
| TEACHER_DUO_REFERENCE.png | AI-generated concept art for this project | Visual direction only; not a rigged asset. |

Rule: nothing gets added to `public/` or the bundle without a row here first.
