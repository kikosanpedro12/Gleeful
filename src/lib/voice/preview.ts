import { LOOKS, type TeacherId } from "@/lib/teacher/rig";
import { useSession } from "@/lib/session/store";
import { loadVoices, ttsAvailable, voiceFor } from "./speech";

/**
 * Onboarding voice preview: the teacher says a short hello in the browser
 * voice we would use for them. Mouth follows a synthetic envelope.
 */
let level = 0;
let timer: ReturnType<typeof setInterval> | undefined;
let t0 = 0;

export const previewLevel = () => level;

export function stopPreview() {
  if (timer) clearInterval(timer);
  timer = undefined;
  level = 0;
  try { if (ttsAvailable()) window.speechSynthesis.cancel(); } catch {}
  useSession.setState({ previewing: null });
}

export async function playPreview(id: TeacherId, onGesture: () => void) {
  stopPreview();
  await loadVoices();
  const text = id === "leo"
    ? "Hi, I'm Leo! I'm an AI teacher. Let's explore things together."
    : "Hi, I'm Mia! I'm an AI teacher. I can't wait to learn with you.";
  useSession.setState({ previewing: id });
  onGesture();
  const start = () => {
    t0 = performance.now();
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      const t = (performance.now() - t0) / 1000;
      level = (0.045 + 0.1 * Math.abs(Math.sin(t * Math.PI * 5))) * Math.max(0.35, 1 - t * 0.9);
    }, 16);
  };
  const end = () => { if (useSession.getState().previewing === id) stopPreview(); };
  const est = Math.max(1500, text.length * 62);
  let started = false;
  if (ttsAvailable()) {
    try {
      const u = new SpeechSynthesisUtterance(text);
      const v = voiceFor(id);
      if (v.voice) u.voice = v.voice;
      u.pitch = v.pitch; u.rate = v.rate;
      u.onstart = () => { started = true; start(); };
      u.onboundary = () => { t0 = performance.now(); };
      u.onend = end;
      u.onerror = end;
      window.speechSynthesis.speak(u);
    } catch {}
  }
  setTimeout(() => { if (!started) { start(); setTimeout(end, est); } }, 700);
  void LOOKS;
}
