---
name: new-lesson
description: Write a new lesson (a skill to teach, with questions, hints, explanations and a later check) for any K1–K12 subject — math, science, English, geography, history, GMRC — inside an existing world. Use when Kiko asks to teach a new topic or add questions.
---

# /new-lesson <subject> <grade> "<topic>" [world]

1. **Pin the skill:** one learning goal a teacher could check in a single question, e.g. "explain why Mars looks red" or "split 12 into equal groups of 3". Map it to a curriculum standard where one exists (DepEd MELC for PH, Common Core / NGSS for US) and note which.
2. **Skill id:** `subject.topic.goal`: lowercase, dotted, letter-led, 2–4 segments, at most 80 characters (`SKILL_RE` in `src/lib/learner/store.ts` and the DB check enforce this). Add a parent-facing label to `SKILL_LABELS` in `src/lib/learner/profile.ts`.
3. **Content** (in `src/lib/worlds/registry.ts`, under the world's `questions` and `facts`):
   - The question is short and in the child's grade-level words.
   - 3 options: exactly one `correct`. The wrong options are the misconceptions kids actually have, never silly ones. Add `keywords` so typed or spoken answers match.
   - `hint` nudges without giving the answer. `explain` gives the answer in 1–2 sentences.
   - A different `*_recall` question for the later check (same skill, new wording).
   - Every fact has a real `sourceId` you opened. For anything contested or simplified, say so in `simulationNotice` or the explanation.
4. **Grade band tone:** K1–3 short sentences and lots of praise; 4–6 "let's be scientists"; 7–12 peer-like and direct, no babyish language.
5. **Brain:** wire the scripted flow in `src/lib/brain/scriptedBrain.ts` (ask → hint once → explain), and the recheck on return. Evidence contexts stay honest: `taught`, `recheck` (same session), `later_check` (a later session; the only one that counts as independent).
6. **Tests:** `tests/brain.test.ts` covers the right answer, the wrong answer then hint, an ambiguous answer being re-asked, and the skill id passing `SKILL_RE`.
7. **Review:** give Kiko the question, options, hint and explanation in chat for a quick check before committing. For K1–3 science and history facts, flag anything a teacher might dispute.
8. Run `npm test`, commit to main, and update CHECKPOINT.
