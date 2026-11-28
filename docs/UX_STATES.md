# UX states checklist (founder standard, 28 Nov 2026)

Every state is designed, not defaulted. Before any visible change is called done, walk this list and read the screenshots (1280, 1920, 390).

## States (each screen, each control)
- [ ] Empty: what the child sees before they type (an example, not a blank box; one quiet way to try a sample).
- [ ] Loading: a visible "working" cue within 1 s (spinner or "Leo is thinking"), the control disabled and still readable, a way out if it is slow.
- [ ] Success: the result is shown where the eye already is; focus stays or moves with a reason.
- [ ] Error: says what happened in plain words, never blames the user ("That's on us"), and says the next step ("Tap Ask to try again"). Keep what they typed.
- [ ] Offline or slow: its own message ("The internet seems to be off"), not the generic error. Nothing is lost.
- [ ] Limit reached (free tries, daily caps): the answer stays readable, one clear next step, no timer removes content.
- [ ] Disabled: solid neutral fill, 2px edge, 4.5:1 text. Never just lower opacity.
- [ ] Off / unavailable (feature switched off, no key): the page says so and offers the working alternative.

## Navigation
- [ ] Back button: returns to the page the person came from with the same state where cheap (no dead end, no trap). A modal or card closes with Escape and returns focus to what opened it.
- [ ] Sign-in: after sign-in the person lands back where they started (the lesson, the pricing page), not on a generic home.
- [ ] Checkout and cancel: Cancel or back from checkout returns to pricing with no charge and a calm line ("Nothing was charged"). Success lands on a page that says what happens next. (Wording only here; payments code is not touched by the UX pass.)
- [ ] Redirects are never silent: a short line says why the person moved.

## Keyboard, focus, motion
- [ ] Every action works by keyboard alone; order follows the visual order; a visible focus ring (3:1) on every control.
- [ ] Focus moves to new content only after the person's own action (a pick, a gate answer), never on a timer.
- [ ] aria-live: one region announces one thing once (a caption, a status); no double announcements.
- [ ] Reduced motion: no waves, no rotating text, no bounce; the page still makes sense.
- [ ] Targets 44px; text works at 200% zoom with no sideways scroll.
- [ ] Sound: starts only from a tap, has a visible off/on state in words, never from a timer.

## Copy tone
- [ ] Plain words a 10-year-old and a parent both follow; short sentences; no jargon, no shame.
- [ ] Never claims more than runs (see CLAUDE.md honesty rules): "recorded greeting, not live voice"; "3 free tries, short answers".
- [ ] Errors and limits for a child never mention payment; the grown-up card does.
