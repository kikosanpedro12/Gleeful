/**
 * The parental-consent wording and its version. ONE source of truth: the page
 * shows exactly this, and the database stores only the version string, so the
 * row can always be matched to the words the parent actually saw.
 *
 * RULE: change any word of the points below => change CONSENT_VERSION. A parent
 * who agreed to an older version is NOT treated as having agreed to the new one
 * (the server only counts consent for the current version).
 *
 * STATUS: early-access wording written by the product team, NOT yet reviewed by a
 * lawyer. A lawyer must confirm it (and that a card payment counts as verification
 * under COPPA / the Philippine Data Privacy Act) before real families use it.
 */
export const CONSENT_VERSION = "2026-11-13.v1";
/** Must match the check on public.parental_consents.consent_text_version. */
export const CONSENT_VERSION_RE = /^[A-Za-z0-9._-]{1,32}$/;

export const CONSENT_TITLE = "Your permission for your child to use Gleeful";

export const CONSENT_POINTS: readonly string[] = [
  "I am the parent or legal guardian of every child I add to Gleeful, and I can give this permission for them.",
  "Gleeful stores, for each child I add: a nickname I choose, a grade, a language, which teacher they picked, and what happened in lessons (which questions were answered, whether a hint was used, and when). It does not store a surname, birth date, school, photo, location, audio or recordings.",
  "When the AI teacher is switched on, what my child types or taps in a lesson is sent to an AI service (Anthropic's Claude) to write the teacher's reply. Gleeful does not save those messages in its database. The AI service handles them under its own terms.",
  "Voice is not collected in this version. If Gleeful ever starts to, I will be asked again before it does.",
  "A child never has their own account. I can change a child's details, delete a child (which deletes their lesson history), or withdraw this permission at any time from the parent area. Withdrawing turns the AI teacher off for my family.",
  "This is early-access wording and may change. If it does, I will be asked to agree again.",
];

export const CONSENT_CHECKBOX = "I have read this and I give permission for my child or children to use Gleeful on these terms.";
