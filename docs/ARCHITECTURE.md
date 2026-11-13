# Architecture (updated 2026-11-12)

Stack: Next.js 16 · React 19 · TypeScript · Three.js + React Three Fiber 9 · Zustand. Database: Supabase schema live on the Gleeful project since 13 Nov (supabase/, docs/DATABASE.md) but **not wired to the app yet**; the app saves through `LearnerStore` (this browser only today). The brain is scripted by default. A Claude brain (Stage B, built 13 Nov, tested only against a mocked API, never against the real one) sits behind `/api/brain` and is off until a build sets `NEXT_PUBLIC_BRAIN=model` and the server has `ANTHROPIC_API_KEY`.

## One turn, end to end
```
child taps / speaks / types
  → SessionController           (turn ids, worlds, choices, questions, taps)        src/lib/session/controller.ts
  → VoiceProvider               (scripted now: browser speech + ScriptedBrain)      src/lib/voice/
  → Brain.respond()             (returns { segments: [{ say, actions }] })          src/lib/brain/
  → each action validated against the CURRENT world                                 src/lib/scene/commands.ts
  → store (Zustand)             (conv state, world, transit, directives, UI)        src/lib/session/store.ts
  → 3D scene reads the store every frame                                            src/components/scene/
       TeacherActor → TeacherAnimator (walk, point, gesture, gaze, mouth, helmet)
       Director     → world travel timeline (walls open → space → land)
       CameraRig    → shots per world, portrait and landscape
```

## Worlds are data
`src/lib/worlds/registry.ts`. A world declares:
- its spots (where the teacher can stand)
- its targets (what can be pointed at)
- its interactive objects (what can be tapped, plus the inspect text)
- its questions (options, a hint, an explanation)
- its facts with sources, a simulation notice, a helmet flag and its transit style

The brain and the validator can only use ids the current world declares. Adding a subject means:
1. Add a world entry (or a classroom activity) with its facts, questions and spots. This part is data.
2. Reuse an existing environment (`classroom`, `planet_surface`). Only a genuinely new kind of place needs a new scene component.
3. Add a lesson to the brain. Scripted now; Claude later reads the world data directly, so new lessons won't need code.

Known gap: the scripted brain is Mars-specific code. That is acceptable because Stage B replaces it, but a second scripted subject would currently mean a second scripted lesson.

## Key rules
- **Turn ids everywhere.** Every child input bumps the turn. Speech, captions, tool calls, directives, choices and invites from an older turn are dropped. Teacher-initiated lines (the greeting, mid-flight remarks, the arrival) wait until the teacher stops talking.
- **The brain cannot run code.** It only gets prepared commands: gesture, pointAt, moveTeacherTo, writeOnBoard, openWorld, offerChoices, askQuestion and inviteTap. Board and choice text is plain text, sanitised and capped, and drawn to a canvas, never rendered as HTML.
- **Honest learner evidence.** Attempts record correctness, hints used and context (`taught` vs `later_check`). One assisted correct answer is never shown as mastery.
- **Measurement built in.** Per turn we log input → first audio and input → first animation; frame stats include the 1% low and stalls. Scripted timings never count as AI latency.

## Adding a world (subject)
1. Data: `src/lib/worlds/registry.ts`.
2. Scene component: `src/components/scene/<World>.tsx`. It shows itself when `fx.shown` is its id.
3. Register it in `src/components/scene/worlds.ts`, the only file that maps worlds to scenes.

The engine (Director, CameraRig, Lights, TeacherActor) reads framing, background, planet and ground from the registry and `worlds.ts`, and has no world-specific code.

## Security layers (see SECURITY.md)
`src/proxy.ts` (per-request CSP nonce) · `next.config.mjs` (headers) · `src/lib/scene/commands.ts` (only validated actions) · `src/lib/learner/store.ts` (validated storage) · `supabase/migrations` (RLS, grants, composite keys) · `tests/db` + `scripts/mutate-rls.mjs` (proof).

## Stage B: the Claude brain (built, mocked-API tested, not yet run against the real API)
```
browser  ClaudeBrain ──POST /api/brain──▶  route.ts → handler.ts                       (src/lib/brain/claudeBrain.ts, src/lib/brain/server/)
         FallbackBrain(Claude, Scripted)    1 kill switch / key present?   → 503 → script
                                            2 same-origin, JSON, byte-capped timed body read → 403/415/413/400
                                            3 per-IP rate limit            → 429
                                            4 validate request (request.ts) → 400
                                            5 per-session limits, daily turns per learner (family time zone), per address, global cap → 429/503 (full tables refuse NEW keys, never evict)
                                            6 prompt.ts: safety rules + world facts FROM THE REGISTRY + child text as data
                                            7 anthropic.ts: one fetch, one 12 s timer over request AND body read, key only here
                                            8 sanitize.ts: text blocks → plain speech; tool calls → parseSceneCommand per world
```
- **Models** (`config.ts`): `claude-haiku-5-5` by default; `claude-sonnet-5-5` only on a "hard turn" (a 120+ character reasoning question, or a server-verified wrong answer after a hint; never length or a client number alone), inside three daily budgets: 20 per learner, 40 per client address, 300 per deployment. Sonnet is priced higher per token (published prices in docs/COSTS.md). One constant turns escalation off.
- **The model can only:** say short plain sentences, and call the same validated tools as the script (ids from the current world). Links, HTML, markdown, unknown tools and unknown ids are dropped. Arriving somewhere simulated always says "simulation": enforced in code.
- **The model never judges answers or writes evidence.** The server tells it correct / not correct from the registry; `ClaudeBrain` records the attempt in the browser from the question data (a first miss is a hint and a retry, not evidence).
- **Fallback:** any failure (no key, limit, timeout, bad output) → the scripted lesson answers that turn. A missing key, kill switch or daily cap pauses model calls for 5 minutes.
- **Env:** `ANTHROPIC_API_KEY` (server only), `BRAIN_DISABLED=1` (kill switch), `NEXT_PUBLIC_BRAIN=model` (build-time opt-in, not a secret). See `.env.example`.
- **Limits live in memory per WARM server instance** (`limits.ts`, behind a `UsageStore` interface so `brain_usage` can replace it). On serverless every instance has its own copy and a cold start clears it, so the real ceiling is (instances × the caps): a brake, not a ceiling. **The Console spend limit is the only real ceiling until `brain_usage` is wired in.** The route sets `maxDuration = 20`.
- **The on-screen badge tells the truth about the last turn:** it reads "AI teacher · test build" only when the model actually answered; a fallback to the script shows "Scripted lesson · not AI yet" (the provider reports `brain.kind` after each turn).

## Discoverability (search engines and AI crawlers)
One policy file, `src/lib/seo/site.ts` (tested in `tests/seo.test.ts`):
- **Public:** `/` (the start screen) and `/llms.txt` (plain-language summary for AI agents: what Gleeful is, honest status, planned pricing, privacy stance). Listed in `sitemap.xml`.
- **Private, always:** `/api`, `/parent`, `/tester`. Disallowed in `robots.txt` AND sent with `X-Robots-Tag: noindex, nofollow, noarchive` (next.config.mjs), since robots.txt is only a request.
- **Switch:** indexing is OFF unless the build has `SITE_INDEXING=on`. While off, robots.txt disallows everything and every route is noindex. Turn it on only with a public landing page and parental consent in place.
- `robots.txt` names the welcomed crawlers (Googlebot, Bingbot, GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended).
- Metadata: title, description, canonical, Open Graph and Twitter cards; a generated share image (`src/app/opengraph-image.tsx`, text and shapes only). Site origin from `NEXT_PUBLIC_SITE_URL` (https only), fallback `https://gleeful-six.vercel.app`.
- schema.org JSON-LD (Organization + SoftwareApplication, `applicationCategory: EducationalApplication`) via `src/lib/seo/JsonLd.tsx`, carrying the CSP nonce. No ratings, offers or claims we cannot back.
- Next: a real public landing page (owned by the UI work on `page.tsx`); then add it to `PUBLIC_PATHS`.
