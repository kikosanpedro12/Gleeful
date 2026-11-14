import type { VoiceEvents, VoiceProvider, SessionInfo } from "./provider";
import type { Brain, BrainInput, Segment } from "@/lib/brain/types";
import { createBrain } from "@/lib/brain";
import { LOOKS } from "@/lib/teacher/rig";
import { learnerStore, type LearnerStore } from "@/lib/learner/store";
import { emptyProfile, type LearnerProfile } from "@/lib/learner/profile";
import { listenOnce, recognitionAvailable, ttsAvailable, voiceFor, loadVoices } from "./speech";

/**
 * DEMO MODE — scripted lesson brain + free browser speech. NOT AI.
 * Words come from ScriptedBrain; the voice is the browser's; the mouth follows
 * a synthetic envelope re-synced on each spoken word (not lip sync).
 * Actions for each sentence are emitted the moment that sentence starts, so
 * pointing/walking land on the words that mention them.
 */
const THINK_MS = 250; // small, deliberate: scripted replies are instant
/** A mid-flight remark is only worth saying while we are still flying, and only if it arrives promptly. */
export const CRUISE_LATE_MS = 5000;

interface Run { id: string; cancelled: boolean; timers: ReturnType<typeof setTimeout>[]; started: boolean }

export class ScriptedProvider implements VoiceProvider {
  readonly mode = "demo" as const;
  micAvailable = recognitionAvailable();

  private seq = 0;
  private run?: Run;
  private level = 0;
  private envT0 = 0;
  private envTimer?: ReturnType<typeof setInterval>;
  private cancelListen?: (() => void) & { stop?: () => void };
  private speakingNow = false;

  /** The brain is injected: ScriptedBrain today, a model-backed brain later. */
  private profile: LearnerProfile = emptyProfile();
  constructor(
    private ev: VoiceEvents,
    private info: SessionInfo,
    private brain: Brain = createBrain(),
    private store: LearnerStore = learnerStore,
  ) {}

  async connect() {
    this.ev.onStatus("connecting");
    await loadVoices();
    this.profile = await this.store.startSession(this.info.teacher).catch(() => emptyProfile());
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
  /** Child tapped the mic again: finish the utterance and use what was heard. */
  stopListening() { if (this.cancelListen?.stop) this.cancelListen.stop(); else this.cancelListening(); }

  private handle(input: BrainInput) {
    this.cancel();
    const name = LOOKS[this.info.teacher].name;
    const id = `s_${++this.seq}`;
    const run: Run = (this.run = { id, cancelled: false, timers: [], started: false });
    this.ev.onResponseCreated(id);
    const startedAt = performance.now();
    // The brain may be async (a model). Whatever it returns is used only if this
    // run is still current: an interrupt during the wait discards the reply.
    Promise.resolve()
      .then(() => this.brain.respond(input, {
        world: this.info.world(),
        teacher: this.info.teacher,
        teacherName: name,
        profile: this.profile,
        session: this.profile.sessions,
        record: (a) => {
          // Update the in-memory copy at once; persist in the background (never blocks the lesson).
          this.profile.attempts.push({ ...a, session: this.profile.sessions, at: new Date().toISOString() });
          void this.store.recordAttempt(a).catch(() => {});
        },
      }))
      .then((reply) => {
        // Honest labelling: report who answered even if this reply is no longer wanted.
        this.ev.onBrainKind?.(this.brain.kind);
        if (run.cancelled || this.run !== run) return;
        // Teacher-initiated lines have a moment. An AI reply that arrives after it is dropped, not spoken
        // ("we're flying!" once we have landed, or a welcome to a world we have already left).
        if (this.isLate(input, performance.now() - startedAt)) {
          this.run = undefined;
          this.ev.onReplyDropped?.(id, "late");
          return;
        }
        const wait = Math.max(0, THINK_MS - (performance.now() - startedAt));
        run.timers.push(setTimeout(() => this.playSegments(run, reply.segments, 0), wait));
      })
      .catch(() => {
        if (run.cancelled || this.run !== run) return;
        this.run = undefined;
        this.ev.onResponseFailed(id, "the lesson had a problem");
      });
  }

  private isLate(input: BrainInput, elapsedMs: number): boolean {
    const w = this.info.world();
    if (input.kind === "transit_cruise") return w !== "transit" || elapsedMs > CRUISE_LATE_MS;
    if (input.kind === "world_ready") return w !== input.world;
    return false;
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
    let begun = false, ended = false, silent = false;
    let estTimer: ReturnType<typeof setTimeout> | undefined;
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
        u.onstart = () => {
          // A slow network voice that starts after we fell back to the silent
          // timeline: follow the real voice from here (wait for its onend).
          if (silent && estTimer) { clearTimeout(estTimer); estTimer = undefined; }
          b();
        };
        u.onboundary = () => { this.envT0 = performance.now(); }; // re-sync mouth to each word
        u.onend = e;
        // Voice failed (common on some devices / headless): keep the normal pace silently
        // instead of rushing through every sentence.
        u.onerror = () => { const wasBegun = begun; b(); run.timers.push(setTimeout(e, wasBegun ? 600 : est)); };
        window.speechSynthesis.speak(u);
      } catch {}
    }
    // No working TTS (or it never starts): run the same timeline silently so the lesson still works.
    // 2.5 s: Android network voices can take a while to start.
    run.timers.push(setTimeout(() => {
      if (begun) return;
      silent = true;
      b();
      estTimer = setTimeout(e, est);
      run.timers.push(estTimer);
    }, ttsAvailable() ? 2500 : 0));
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
