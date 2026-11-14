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
| Landing worlds: classroom, ocean, leaf cell, dinosaur valley, ancient city, fraction island, space | src/components/landing/worlds3d.ts | Generated in code for this project; stylised, not reconstructions of real places or animals | Owned | Yes |
| Landing still illustrations (posters) | src/components/landing/Posters.tsx | Drawn in SVG for this project | Owned | Yes |
| Unbounded (display typeface) | @fontsource-variable/unbounded 5.3.0 | Google Fonts via Fontsource, self-hosted | SIL Open Font License 1.1 | Yes |
| Atkinson Hyperlegible (body typeface) | @fontsource/atkinson-hyperlegible 5.3.0 | Braille Institute via Fontsource, self-hosted | SIL Open Font License 1.1 | Yes |
| Voice lab sample clips (20 short mp3s) | public/voice-lab/ | Generated offline 14 Nov 2026 with Kokoro-82M (kokoro-onnx v1.0 model files, voice presets am_michael, am_adam, af_heart, af_bella). Used only on the private /voice-lab comparison page | Model: Apache 2.0 | Yes (confirm voice-preset terms before shipping any as the product voice) |
| Teacher voices | runtime | The user's browser / OS speech voices | Not shipped by us; device-dependent | Test only. Choose a licensed voice for production. |
| Speech recognition | runtime | Browser Web Speech API (Chrome sends audio to Google to transcribe) | Google / browser terms | Test only. Review before real-child use. |

## Reference-only material: NOT in this repo, never ship
| Item | License | Note |
|---|---|---|
| Concept video avatar (Ready Player Me via met4citizen/TalkingHead) | CC BY-NC 4.0 | Non-commercial. Do not extract or reuse. |
| Concept video Mars globe texture (Solar System Scope) | CC BY 4.0 | Usable with credit, but not used here. |
| TEACHER_DUO_REFERENCE.png | AI-generated concept art for this project | Visual direction only; not a rigged asset. |
| Deepgram Aura-2 text-to-speech (service) | /api/tts, voice-lab test slots | Live API calls, no files stored. Free $200 credit account created by the founder 14 Nov 2026 | Deepgram Terms of Service (service use; confirm output-use and data-retention terms before the product voice goes to children) | To confirm |

Rule: nothing gets added to `public/` or the bundle without a row here first.
