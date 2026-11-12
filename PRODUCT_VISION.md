# Product vision (condensed from the founder brief, 11 Nov 2026)

**Guiding question:** can a child talk to a present, animated teacher, influence an interactive learning world, and gradually become more capable with less help?

## Full vision (roadmap, not a claim)
- A personal AI teacher inside a living, interactive learning world. Grades 1–12, many subjects, global, English first.
- The lesson is the interface: the teacher moves, speaks, listens, and takes the child into visual worlds (Mars, a cell, a historical place) that are functional teaching material.
- Child-led: speak, type or show schoolwork. No adult has to author a lesson first.
- Two AI teachers, Leo and Mia (placeholders). Friendly, credible adults; honestly identified as AI.
- Personalisation = evidence-based learner profile (skill, task, answer, hints, independence, later retention). Observations kept separate from inferences. No fixed labels ("visual learner"). No per-child model training.
- Parents buy; children use. Pricing hypothesis $30/month per child — must be validated against real cost and usage.

## Non-negotiables
- Real rigged 3D body and real-time engine on the device. Not a talking avatar beside a chat box; not generated video per frame.
- Interruptions work: stale audio, mouth movement and queued actions stop; turn IDs block old responses from changing the scene.
- Speed target: meaningful spoken reply + animation ~2–4 s after the child stops (median ~2 s, p95 ≤ 4 s). Measured honestly incl. VAD delay, cold/warm, failures. Filler does not count.
- Rendering ≥ 30 fps on an ordinary phone; report stalls, not just averages.
- The model only triggers validated semantic actions (openWorld, pointAt, moveTeacherTo…). Never arbitrary code or remote URLs.
- Honesty: label simulated/incomplete features; never fake a live response; never claim lip sync, latency or memory that was not tested.
- Safety: parent-managed profiles, minimal data, no raw child audio retained by default, safe replies, no diagnosing. Uploaded/retrieved content is untrusted.
- Simulation honesty: e.g. never imply a person can stand unprotected on Mars.
- Assets: commercially usable only, with a license manifest. The concept video avatar is CC BY-NC — never reuse it.

## Subjects
Any K–12 subject: math, science, English/reading/writing, geography, history, GMRC (Good Manners and Right Conduct), languages. **Mars is only the first test world.** History needs care: separate evidence from dramatised scenes. GMRC needs care: model good conduct through situations and choices, never shame a child.

## First slice (what we are building now)
Browser prototype for private family testing: Leo + Mia, classroom + one Mars world, live voice with interruption + typed fallback, body animation/gaze/basic lip movement, one object interaction that changes the lesson, small reviewed Mars fact set + one recall check, basic learner profile with cross-session memory, minimal parent area, latency/fps/usage instrumentation. Then one image/PDF assignment upload.

## Explicitly out of scope
Multiplayer, mandatory VR, crypto/NFT, school-district admin, marketplace, original full curriculum, accreditation.

## Budget
Solo founder. $200–$400 technical validation first; provisional $1,000–$2,500 reserve. No purchases, subscriptions or unbounded API spend without agreement.

## Build order
See BUILD_PLAN.md. Founder decision 12 Nov 2026: experience first with a scripted brain, then a Claude API brain; OpenAI dropped.
