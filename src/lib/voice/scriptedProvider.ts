import type { VoiceEvents, VoiceProvider, SessionInfo } from "./provider";
import type { Brain, BrainInput, Segment } from "@/lib/brain/types";
import { ScriptedBrain } from "@/lib/brain/scriptedBrain";
import { LOOKS } from "@/lib/teacher/rig";
import { loadProfile, updateProfile } from "@/lib/learner/profile";
import { listenOnce, recognitionAvailable, ttsAvailable, voiceFor, loadVoices } from "./speech";

/**
 * DEMO MODE — scripted lesson brain + free browser speech. NOT AI.
 * Words come from ScriptedBrain; the voice is the browser's; the mouth follows
 * a synthetic envelope re-synced on each spoken word (not lip sync).
 * Actions for each sentence are emitted the moment that sentence starts, so
 * pointing/walking land on the words that mention them.
 */
const THINK_MS = 250; // small, deliberate: scripted replies are instant

interface Run { id: string; cancelled: boolean; timers: ReturnType<typeof setTimeout>[]; started: boolean }

export class ScriptedProvider implements VoiceProvider {
  readonly mode = "demo" as const;
  micAvailable = recognitionAvailable();
  private brain: Brain = new ScriptedBrain();
  private seq = 0;
  private run?: Run;
  private level = 0;
  private envT0 = 0;
  private envTimer?: ReturnType<typeof setInterval>;
  private cancelListen?: () => void;
  private speakingNow = false;

  constructor(private ev: VoiceEvents, private info: SessionInfo) {}

  async connect() {
    this.ev.onStatus("connecting");
    await loadVoices();
    updateProfile((p) => { p.sessions += 1; p.teacher = this.info.teacher; });
    this.envTimer = setInterval(() => this.tickEnvelope(), 16);
    this.ev.onStatus("connected");
  }

  disconnect() {
    this.cancel();
    this.cancelListening();
    if (this.envTimer) clearInterval(this.envTimer);
    this.ev.onStatus("disconnected");
  }

  // ----------------------------------------------------------------- input
  sendText(text: string) { this.handle({ kind: "text", text }); }
  sendEvent(input: BrainInput) { this.handle(input); }
  greet() { this.handle({ kind: "session_start" }); }

  listenOnce() {
    this.cancelListening();
    this.cancelListen = listenOnce({
      onStart: () => this.ev.onUserSpeechStart(performance.now()),
      onInterim: (t) => this.ev.onUserInterim?.(t),
      onFinal: (text, endAt) => {
        this.cancelListen = undefined;
        this.ev.onUserSpeechStop(performance.now(), endAt);
        this.ev.onUserTranscript(text);
        this.handle({ kind: "text", text });
      },
      onNothing: (reason) => { this.cancelListen = undefined; this.ev.onListenFailed?.(reason); },
    });
  }
  cancelListening() { this.cancelListen?.(); this.cancelListen = undefined; }

  private handle(input: BrainInput) {
    this.cancel();
    const name = LOOKS[this.info.teacher].name;
    const reply = this.brain.respond(input, {
      world: this.info.world(),
      teacher: this.info.teacher,
      teacherName: name,
      profile: loadProfile(),
      record: (a) => updateProfile((p) => { p.attempts.push({ ...a, at: new Date().toISOString() }); }),
    });
    const id = `s_${++this.seq}`;
    const run: Run = (this.run = { id, cancelled: false, timers: [], started: false });
    this.ev.onResponseCreated(id);
    run.timers.push(setTimeout(() => this.playSegments(run, reply.segments, 0), THINK_MS));
  }

  // ---------------------------------------------------------------- output
  private playSegments(run: Run, segs: Segment[], i: number) {
    if (run.cancelled) return;
    if (i >= segs.length) return this.finish(run);
    const seg = segs[i];
    const begin = () => {
      if (run.cancelled) return;
      if (!run.started) { run.started = true; this.ev.onAudioStart(run.id, performance.now()); }
      this.speakingNow = true;
      this.envT0 = performance.now();
      seg.actions?.forEach((a, k) => this.ev.onToolCall(run.id, `${run.id}_${i}_${k}`, a.name, JSON.stringify(a.args)));
      this.ev.onAssistantTranscript(run.id, seg.say, true);
    };
    const next = () => {
      if (run.cancelled) return;
      this.speakingNow = false;
      run.timers.push(setTimeout(() => this.playSegments(run, segs, i + 1), 180));
    };
    this.speak(run, seg.say, begin, next);
  }

  private speak(run: Run, text: string, onBegin: () => void, onEnd: () => void) {
    let begun = false, ended = false;
    const b = () => { if (!begun) { begun = true; onBegin(); } };
    const e = () => { if (!ended && begun) { ended = true; onEnd(); } };
    const est = Math.max(1100, text.length * 60);
    if (ttsAvailable()) {
      try {
        const u = new SpeechSynthesisUtterance(text);
        const v = voiceFor(this.info.teacher);
        if (v.voice) u.voice = v.voice;
        u.pitch = v.pitch;
        u.rate = v.rate;
        u.lang = v.voice?.lang ?? "en-US";
        u.onstart = b;
        u.onboundary = () => { this.envT0 = performance.now(); }; // re-sync mouth to each word
        u.onend = e;
        // Voice failed (common on some devices / headless): keep the normal pace silently
        // instead of rushing through every sentence.
        u.onerror = () => { const wasBegun = begun; b(); run.timers.push(setTimeout(e, wasBegun ? 600 : est)); };
        window.speechSynthesis.speak(u);
      } catch {}
    }
    // No working TTS (or it never starts): run the same timeline silently so the lesson still works.
    run.timers.push(setTimeout(() => { if (!begun) { b(); run.timers.push(setTimeout(e, est)); } }, 900));
    run.timers.push(setTimeout(() => { b(); e(); }, est + 9000)); // never hang
  }

  private finish(run: Run) {
    if (this.run !== run) return;
    this.run = undefined;
    this.speakingNow = false;
    this.ev.onAudioStop(run.id);
  }

  private tickEnvelope() {
    if (!this.speakingNow) { this.level = 0; return; }
    const t = (performance.now() - this.envT0) / 1000;
    // Syllable-like pulses (~5 Hz), decaying within a word until the next boundary resets it.
    const word = Math.max(0.35, 1 - t * 0.9);
    this.level = (0.045 + 0.1 * Math.abs(Math.sin(t * Math.PI * 5)) ) * word;
  }

  private cancel() {
    const r = this.run;
    if (r) {
      r.cancelled = true;
      r.timers.forEach(clearTimeout);
      this.run = undefined;
    }
    this.speakingNow = false;
    this.level = 0;
    try { if (ttsAvailable()) window.speechSynthesis.cancel(); } catch {}
  }

  interrupt() { this.cancel(); }
  setMicEnabled() {}
  getOutputLevel() { return this.level; }
  getInputLevel() { return 0; }
  submitToolResult() {}
}
