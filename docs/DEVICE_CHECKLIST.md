# Manual device checklist (scripted build)

Devices: Windows laptop (Huawei MateBook D 16) in Chrome; Android phone (Honor X9b) in Chrome.
- The microphone needs HTTPS. On the laptop, http://localhost is fine.
- The phone needs the private deploy or a tunnel; plain http://LAN-IP will not work.

Open `/?dev=1` for the measurement panel.

**Onboarding**
- [ ] Both teachers are visible. Tapping each plays a hello with a wave, in a male voice (Leo) and a female voice (Mia). Note the voice names you hear.
- [ ] "Start with …" begins the lesson.

**The trip**
- [ ] The greeting offers "I have homework about Mars". Tapping it makes the teacher walk to the rug.
- [ ] The walls peel away and stars appear, the teacher wears a helmet, and Mars grows. The landing flash is not uncomfortable.
- [ ] On Mars: a "Simulation" label, and the teacher says people need spacesuits.
- [ ] "Why is everything red?" makes the teacher walk to the rock and point. "Tap to investigate" appears.
- [ ] Tap the rock: it floats up and can be spun with a finger. The card shows the NASA source.
- [ ] Answer wrong once: you get a hint, not praise. Then answer right.
- [ ] Crater and volcano: the teacher walks there and points at the right thing.
- [ ] Back to class: a quick check with no hints.
- [ ] /parent shows "with a hint" for the lesson answer and the later check result.

**Talking and interrupting**
- [ ] Tap the mic and ask "why is Mars red?": the right answer comes back.
- [ ] Ask something off-script: the teacher says honestly that the lesson is scripted.
- [ ] Tap the mic or ✋ Stop while the teacher talks: speech, mouth and walking stop at once.
- [ ] Do the same during the space flight: the trip still lands cleanly.
- [ ] Block the mic permission: you get a message, and tapping answers and typing still work.

**Comfort and accessibility**
- [ ] With the OS "reduce motion" setting on, the trip is a short fade.

**Record** (press "Export measurements" and keep the JSON)
| Device | fps avg | 1% low | stalls | worst frame | quality fell back? | voices OK? |
|---|---|---|---|---|---|---|
| Laptop | | | | | | |
| Phone | | | | | | |
