# Manual device + performance checklist

Test matrix (first pass): Windows laptop (Huawei MateBook D 16) on Chrome; Android phone (Honor X9b) on Chrome. Phone must reach the app over HTTPS (mic needs it) — use the private deployment or a tunnel, not plain http://LAN-IP.

For each device, open `/?dev=1`:

**Setup** — [ ] OpenAI monthly budget limit set · [ ] `.env.local` has key · [ ] note network (Wi-Fi/4G) and whether headphones are used

**Conversation (live mode — badge must say "Live", not DEMO)**
- [ ] Leo greets by voice and waves
- [ ] Ask 20+ short spoken questions. Leave the panel open.
- [ ] For each: was the *first thing heard* a real answer, not filler? Count fillers: ___
- [ ] Ask "why is Mars red?" → he points at the globe, ring appears on it
- [ ] Ask him to write a word on the board → text changes, he walks/points
- [ ] Ask to go to Mars → he says honestly it is not built yet
- [ ] Ask something off-topic/unsupported → sensible, safe answer

**Interruption**
- [ ] Talk over him mid-sentence: audio stops < ~0.5 s, mouth closes, arm drops, he answers the new thing
- [ ] Press ✋ Stop: same
- [ ] Type while he talks: same
- [ ] After 5 interruptions in a row nothing is stuck (state returns to "Your turn")

**Fallbacks**
- [ ] Deny mic permission → typing offered, spoken answers still work
- [ ] Turn off Wi-Fi mid-session → clear message, Start reconnects
- [ ] Remove API key → DEMO badge appears, nothing pretends to be live
- [ ] Wrong access code (if set) → clear refusal

**Record** (press "Export measurements" and keep the JSON)
| Device | Net | n | median ms | p95 ms | VAD wait | fails | fps avg | 1% low | stalls | quality |
|---|---|---|---|---|---|---|---|---|---|---|
| Laptop | | | | | | | | | | |
| Phone | | | | | | | | | | |

Echo note: on speakers the mic can hear Leo and trigger false interruptions. Record whether it happens with and without headphones.
