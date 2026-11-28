import { AI_NOUN, NOUN } from "./copy";

export const STEPS = [
  { title: "Your child asks", body: "Out loud or typed, in their own words. Questions about science, maths, reading, history and the world." },
  { title: `The ${NOUN} shows it`, body: `It walks, points and draws on the board, then takes the class somewhere to look closer.` },
  { title: "Your child explores", body: "Tap, pick up and spin things. Answer questions, and get a hint when stuck." },
  { title: "You see what stuck", body: "The parent view separates answers given with help from answers given a day later, alone. In this early version it is saved on the device you used." },
];

export const TODAY = [
  { title: "No child accounts", body: "Parents own every child profile. We ask for a nickname and grade, never a surname, school or birthday." },
  { title: "We don't record audio", body: "We keep no recordings or transcripts of what your child says. When the mic is on, your browser's own speech service turns speech into text, and the start screen says so." },
  { title: "Progress that isn't inflated", body: "A right answer after a hint is never shown as mastery. Only a later, unaided answer counts as learned." },
  { title: `A ${NOUN} on rails`, body: `The ${NOUN} can only take approved actions in worlds we built. It can't open links, browse the web or show outside content.` },
];
export const BEFORE_LAUNCH = [
  "Verifiable parental consent, following COPPA, GDPR-K and the Philippine Data Privacy Act",
  "Export or delete your family's data whenever you like",
  `A child-safety test set the live ${AI_NOUN} has to pass`,
  "An independent security review of the live app",
];

export const FAQ = [
  { q: `Is the ${NOUN} really AI?`, a: `Yes. The tutor on the home page is the real AI, built on Anthropic's Claude: you get three free tries. The demo lesson at /learn is scripted, not AI. If the live tutor is ever paused, the page says so instead of faking an answer.` },
  { q: "What ages is it for?", a: "Kindergarten to grade 12. You set your child's grade (kindergarten is grade 0 in our records), and lessons are pitched to it. Today's demo is one scripted lesson." },
  { q: "Do we need to install anything?", a: "No. It runs in the browser on phones, tablets and laptops. On older devices the trips show as still pictures, and the lesson works the same." },
  { q: "Does it replace school?", a: "No. Gleeful is for curiosity and practice at home, alongside school and alongside you." },
  { q: "How does the free trial work?", a: "At launch you start a 7-day free trial with a card. You're charged on day 8 unless you cancel first, and you can cancel any time. Nothing is charged today." },
  { q: "Are there ads?", a: "No. Gleeful is paid for by families, not advertisers." },
];

