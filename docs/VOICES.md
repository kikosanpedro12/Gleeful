# Tutor voices (ElevenLabs)

Decision (18 Nov 2026): ElevenLabs is the live voice. Blind test on a real phone, Leo, 5 lines: the ElevenLabs stand-in scored Great on all 5. Every other engine scored OK at best (Deepgram, Kokoro, the phone's built-in voice). Mia, same test (18 Nov): ElevenLabs Great on all 5, the rest OK or Robotic.

## MVP voices (now)
- Leo: premade "Will" (`bIHbv24MWmeRgasZH58o`), already the default in `src/lib/tts/elevenHandler.ts`.
- Mia: premade "Jessica" (`cgSgspJ2msm6clMCkdW9`), default. Founder blind test 18 Nov: Great on all 5 lines, best of 7 engines.
- Change a voice with no code change: set `ELEVEN_VOICE_LEO` / `ELEVEN_VOICE_MIA` (20-character voice id) in Vercel and redeploy.

## Designed voices (later, when we want a signature sound)
Descriptions drafted for Voice Design. Previews cost credits, so none were generated yet.
- Leo: warm, friendly young man, calm and upbeat, like a patient older brother. Clear, medium pace, smiles while talking. Never shouty. Neutral, easy-to-understand English accent.
- Mia: bright, kind young woman, gentle and encouraging, like a favourite teacher. Clear, medium pace, a little playful. Never babyish. Neutral, easy-to-understand English accent.
- Spare 1: cheerful, energetic coach, slightly deeper voice, fast-but-clear for games and challenges.
- Spare 2: soft, soothing storyteller, slower pace, for calm and wind-down moments.

Process: generate 3 previews per description, the founder picks, save the winner (permanent voice id on the account), put the ids in Vercel. Voices stay on the ElevenLabs account and cannot be downloaded; audio we generate is ours.

## Rules
- Never clone a real person's voice or train anything on ElevenLabs output.
- No claims about latency or quality in the product until measured.
- Filipino/Tagalog lessons: check ElevenLabs language support before promising it.
