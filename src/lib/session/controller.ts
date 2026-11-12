import { useSession, emptyUsage, type SessionStore } from "./store";
import { reduce, type ConvEvent } from "@/lib/teacher/stateMachine";
import { parseToolCall } from "@/lib/scene/commands";
import { toResult, type TurnTiming, type TurnResult } from "@/lib/telemetry/latency";
import type { VoiceEvents, VoiceProvider, SessionInfo } from "@/lib/voice/provider";
import { ScriptedProvider } from "@/lib/voice/scriptedProvider";
import type { BrainInput } from "@/lib/brain/types";
import type { TeacherId } from "@/lib/teacher/rig";
import { contextFor, WORLDS, type WorldId } from "@/lib/worlds/registry";

/**
 * Single owner of conversation flow. Provider events come in here, pass
 * through the pure state machine, and come out as store state that the 3D
 * scene reads. Everything is tagged with a turn id; stale output is dropped.
 * World travel is owned here too: the scene only animates what the store says.
 */
const RESPONSE_TIMEOUT_MS = 12000;
const RESULTS_KEY = "aiteacher.latency.v1";
const MAX_MIN = Number(process.env.NEXT_PUBLIC_MAX_SESSION_MINUTES || 15);
export const TRANSIT_MS = { space_flight: 9000, fade: 1400 } as const;
export const REDUCED_TRANSIT_MS = 900;

export type ProviderFactory = (ev: VoiceEvents, info: SessionInfo) => VoiceProvider;

/** Longer than flushSoon's 1.2 s so a queued line always wins. */
export const STRAND_GUARD_MS = 1600;

class SessionController {
  private provider?: VoiceProvider;
  private factory: ProviderFactory = (ev, info) => new ScriptedProvider(ev, info);
  private responseTurn = new Map<string, number>();
  private timings = new Map<number, TurnTiming>();
  private timeout?: ReturnType<typeof setTimeout>;
  private sessionCap?: ReturnType<typeof setTimeout>;
  private firstTurnDone = false;
  private seq = 0;
  /** The teacher is about to speak on its own (greeting, arrival): accept that reply in idle. */
  private systemReplyPending = false;
  /** World events that arrived while the teacher was talking; delivered when he stops. */
  private queued: BrainInput[] = [];
  private captionFor = "";
  private transitWatchdog?: ReturnType<typeof setTimeout>;
  private flushTimer?: ReturnType<typeof setTimeout>;
  /** Tap-to-talk asked for the mic and it has not started or failed yet. */
  private listenRequested = false;
  /** The last thing the child was asked to answer or tap, per world, until they respond. */
  private lastPrompt?: { world: WorldId; choices: SessionStore["choices"]; question: SessionStore["question"]; invite: SessionStore["invite"] };
  private strandTimer?: ReturnType<typeof setTimeout>;

  get set() { return useSession.setState; }
  get s(): SessionStore { return useSession.getState(); }

  /** Tests inject a fake provider here. */
  setProviderFactory(f: ProviderFactory) { this.factory = f; }

  private dispatch(e: ConvEvent) {
    const before = this.s.conv;
    const conv = reduce(before, e);
    if (conv === before) return;
    const patch: Partial<SessionStore> = { conv };
    if (conv.turnId !== before.turnId) {
      // New turn: anything queued or on screen for the old one is obsolete.
      this.systemReplyPending = false;
      const dropped = this.s.directives.length;
      patch.directives = [];
      patch.choices = [];
      patch.invite = null;
      if (dropped) patch.staleDropped = this.s.staleDropped + dropped;
      this.finalize(before.turnId, conv.interrupted);
    }
    this.set(patch);
    // Queued teacher lines wait for a turn to end NATURALLY. An interrupt is the
    // child taking the floor, so it must never release a queued line.
    const endedNaturally = conv.state === "idle" && before.state !== "idle" && conv.turnId === before.turnId &&
      (e.type === "RESPONSE_AUDIO_STOP" || e.type === "RESPONSE_FAILED" || e.type === "LISTEN_CANCELLED");
    if (endedNaturally) this.flushQueued();
  }

  private finalize(turnId: number, interrupted = false) {
    const t = this.timings.get(turnId);
    if (!t) return;
    this.timings.delete(turnId);
    if (interrupted && t.firstAudio === undefined) t.interrupted = true;
    const r = toResult(t);
    this.set({ results: [...this.s.results, r] });
    try {
      const prev: unknown[] = JSON.parse(localStorage.getItem(RESULTS_KEY) || "[]");
      prev.push({ ...r, at: new Date().toISOString(), model: this.s.model });
      localStorage.setItem(RESULTS_KEY, JSON.stringify(prev.slice(-500)));
    } catch {}
  }

  private armTimeout(turnId: number) {
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = setTimeout(() => {
      if (this.s.conv.turnId !== turnId || this.s.conv.state !== "thinking") return;
      const t = this.timings.get(turnId);
      if (t) t.failed = true;
      this.finalize(turnId);
      this.provider?.interrupt();
      this.dispatch({ type: "RESPONSE_FAILED", turnId });
      this.set({ banner: { kind: "error", text: "The teacher took too long to answer. Please try again." } });
    }, RESPONSE_TIMEOUT_MS);
  }

  private line(role: "child" | "teacher", text: string, turnId: number, append = false) {
    const tr = this.s.transcript;
    const last = tr[tr.length - 1];
    if (append && last && last.role === role && last.turnId === turnId) {
      this.set({ transcript: [...tr.slice(0, -1), { ...last, text: last.text + text }] });
    } else {
      this.set({ transcript: [...tr.slice(-60), { id: ++this.seq, role, text, turnId }] });
    }
  }

  private currentWorld(): WorldId | "transit" { return this.s.transit ? "transit" : this.s.world; }

  private events: VoiceEvents = {
    onStatus: (status, detail) => {
      this.set({ status });
      if (status === "connected") {
        this.dispatch({ type: "CONNECTED" });
        this.set({ micAvailable: this.provider?.micAvailable ?? false });
        if (!this.provider?.micAvailable)
          this.set({ banner: { kind: "info", text: "Voice input isn't available in this browser. You can tap the answers or type instead." } });
        this.systemReplyPending = true;
        this.provider?.greet();
      }
      if (status === "disconnected") {
        if (this.sessionCap) clearTimeout(this.sessionCap);
        if (this.timeout) clearTimeout(this.timeout);
        this.queued = [];
        this.lastPrompt = undefined;
        if (this.strandTimer) clearTimeout(this.strandTimer);
        if (this.transitWatchdog) clearTimeout(this.transitWatchdog);
        this.dispatch({ type: "DISCONNECTED" });
        this.set({ listening: false, interim: "", choices: [], question: null, invite: null, inspecting: null, transit: null, world: "classroom" });
        if (detail) this.set({ banner: { kind: "error", text: `${detail} Tap Start to reconnect.` } });
      }
    },
    onUserSpeechStart: () => {
      this.listenRequested = false;
      this.set({ listening: true, interim: "" });
      this.dispatch({ type: "USER_SPEECH_START" });
    },
    onUserInterim: (text) => this.set({ interim: text }),
    onUserSpeechStop: (t, utteranceEnd) => {
      this.set({ listening: false });
      if (this.s.conv.state !== "listening") return;
      this.dispatch({ type: "USER_SPEECH_STOP" });
      this.lastPrompt = undefined;
      const turnId = this.s.conv.turnId;
      this.timings.set(turnId, { turnId, mode: this.provider!.mode, input: "voice", cold: !this.firstTurnDone, vadEnd: t, utteranceEnd });
      this.firstTurnDone = true;
      this.armTimeout(turnId);
    },
    onListenFailed: (reason) => {
      this.listenRequested = false;
      this.set({ listening: false, interim: "" });
      this.dispatch({ type: "LISTEN_CANCELLED" });
      if (reason === "denied") this.set({ micAvailable: false, banner: { kind: "info", text: "The microphone is blocked. You can tap the answers or type instead." } });
      else if (reason === "no-speech") this.set({ banner: { kind: "info", text: "I didn't hear anything. Tap the mic and try again." } });
      else if (reason === "error") this.set({ banner: { kind: "info", text: "Voice input had a problem. You can tap the answers or type." } });
      this.guardStranded();
    },
    onUserTranscript: (text) => { this.set({ interim: "" }); this.line("child", text, this.s.conv.turnId); },
    onResponseCreated: (id) => {
      const st = this.s.conv.state;
      if (st === "thinking" || st === "speaking" || this.systemReplyPending) {
        this.systemReplyPending = false;
        this.responseTurn.set(id, this.s.conv.turnId);
        return;
      }
      this.set({ staleDropped: this.s.staleDropped + 1 });
      this.provider?.interrupt();
    },
    onAudioStart: (id, t) => {
      const turnId = this.responseTurn.get(id);
      if (turnId === undefined || turnId !== this.s.conv.turnId) return;
      const timing = this.timings.get(turnId);
      if (timing && timing.firstAudio === undefined) timing.firstAudio = t;
      this.dispatch({ type: "RESPONSE_AUDIO_START", turnId });
    },
    onAudioStop: (id) => {
      const turnId = this.responseTurn.get(id);
      if (turnId === undefined) return;
      this.dispatch({ type: "RESPONSE_AUDIO_STOP", turnId });
      this.finalize(turnId);
    },
    onResponseFailed: (id, reason) => {
      const turnId = this.responseTurn.get(id);
      if (turnId === undefined || turnId !== this.s.conv.turnId) return;
      const t = this.timings.get(turnId);
      if (t) t.failed = true;
      this.finalize(turnId);
      this.dispatch({ type: "RESPONSE_FAILED", turnId });
      this.set({ banner: { kind: "error", text: `The teacher could not answer (${reason}). Please try again.` } });
    },
    onAssistantTranscript: (id, delta, newSegment) => {
      const turnId = this.responseTurn.get(id);
      if (turnId === undefined || turnId !== this.s.conv.turnId) return;
      const tr = this.s.transcript.at(-1);
      const sep = tr && tr.role === "teacher" && tr.turnId === turnId && !/\s$/.test(tr.text) && !/^\s/.test(delta) ? " " : "";
      this.line("teacher", sep + delta, turnId, true);
      this.set({ caption: newSegment || this.captionFor !== id ? delta.trim() : this.s.caption + delta });
      this.captionFor = id;
    },
    onToolCall: (id, callId, name, args) => {
      const turnId = this.responseTurn.get(id);
      if (turnId === undefined || turnId !== this.s.conv.turnId) {
        this.set({ staleDropped: this.s.staleDropped + 1 });
        this.provider?.submitToolResult(callId, JSON.stringify({ ok: false, error: "cancelled: the child started a new turn" }));
        return;
      }
      const parsed = parseToolCall(name, args, contextFor(this.currentWorld()));
      if (!parsed.ok) {
        this.set({ rejectedCommands: this.s.rejectedCommands + 1 });
        this.provider?.submitToolResult(callId, JSON.stringify({ ok: false, error: parsed.error }));
        return;
      }
      const c = parsed.command;
      switch (c.name) {
        case "writeOnBoard": this.set({ boardText: c.text }); break;
        case "offerChoices": this.set({ choices: c.choices, question: null }); this.rememberPrompt(); break;
        case "askQuestion": this.set({ question: { id: c.questionId, world: this.s.world }, choices: [] }); this.rememberPrompt(); break;
        case "inviteTap": this.set({ invite: c.target }); this.rememberPrompt(); break;
        case "openWorld": this.beginTransit(c.world); break;
      }
      // Body/scene actions go to the animator queue (gesture, pointAt, moveTeacherTo, inviteTap).
      if (c.name === "gesture" || c.name === "pointAt" || c.name === "moveTeacherTo" || c.name === "inviteTap" || c.name === "writeOnBoard")
        this.set({ directives: [...this.s.directives, { id: ++this.seq, turnId, command: c }] });
      this.provider?.submitToolResult(callId, JSON.stringify({ ok: true }));
    },
    onUsage: (u) => {
      const p = this.s.usage;
      this.set({ usage: { inputTokens: p.inputTokens + u.inputTokens, outputTokens: p.outputTokens + u.outputTokens, cachedTokens: p.cachedTokens + u.cachedTokens, responses: p.responses + 1 } });
    },
    onError: (message) => this.set({ banner: { kind: "error", text: message } }),
  };

  // ------------------------------------------------------------------ worlds
  private beginTransit(to: WorldId) {
    if (this.s.transit) return;
    const from = this.s.world;
    const style = WORLDS[to].transit === "space_flight" && from === "classroom" ? "space_flight" : "fade";
    const t0 = performance.now();
    this.set({ transit: { from, to, t0, style }, inspecting: null, invite: null, question: null });
    // The 3D director normally lands the trip. If it can't (no WebGL, lost
    // context, tab hidden), land it anyway so the lesson can't get stuck.
    if (this.transitWatchdog) clearTimeout(this.transitWatchdog);
    this.transitWatchdog = setTimeout(() => {
      if (this.s.transit?.t0 === t0) this.transitEvent("arrived");
    }, TRANSIT_MS[style] + 1500);
  }

  /** Called by the scene's transit director at the cruise point and on arrival. */
  transitEvent(kind: "cruise" | "arrived") {
    const tr = this.s.transit;
    if (!tr) return;
    if (kind === "arrived") {
      if (this.transitWatchdog) clearTimeout(this.transitWatchdog);
      this.set({ world: tr.to, transit: null });
      this.deliverSystem({ kind: "world_ready", world: tr.to });
    } else if (tr.style === "space_flight") {
      this.deliverSystem({ kind: "transit_cruise", to: tr.to });
    }
  }

  /** Teacher-initiated speech. Waits politely if the teacher or child is mid-turn. */
  private deliverSystem(input: BrainInput) {
    const st = this.s.conv.state;
    if (st === "speaking" || st === "thinking" || st === "listening") {
      // Only the newest arrival matters; a stale cruise line is dropped.
      this.queued = this.queued.filter((q) => q.kind !== "transit_cruise");
      this.queued.push(input);
      return;
    }
    if (st === "offline" || !this.provider) return;
    this.systemReplyPending = true;
    this.provider.sendEvent(input);
  }

  private flushQueued() {
    // A cruise line is pointless once we have landed; an arrival line is
    // pointless if we are no longer in that world.
    if (!this.s.transit) this.queued = this.queued.filter((q) => q.kind !== "transit_cruise");
    this.queued = this.queued.filter((q) => q.kind !== "world_ready" || q.world === this.s.world);
    const next = this.queued.shift();
    if (next) this.deliverSystem(next);
  }

  /** Called by the 3D teacher the first frame it animates a spoken reply or gesture for a turn. */
  markAnimation(turnId: number) {
    const t = this.timings.get(turnId);
    if (t && t.firstAnimation === undefined) t.firstAnimation = performance.now();
  }

  // -------------------------------------------------------------- lifecycle
  chooseTeacher(teacher: TeacherId) {
    // Switching keeps the learner history: it lives in the learner profile, not the teacher.
    this.set({ teacher });
  }

  async start() {
    const teacher = this.s.teacher;
    if (this.s.status !== "disconnected" || !teacher) return;
    this.set({
      banner: null, status: "connecting", transcript: [], usage: { ...emptyUsage }, directives: [],
      boardText: "Ask me anything!", world: "classroom", transit: null, choices: [], question: null,
      invite: null, inspecting: null, listening: false, interim: "",
    });
    this.firstTurnDone = false;
    this.systemReplyPending = false;
    this.queued = [];
    this.responseTurn.clear();
    try {
      this.provider = this.factory(this.events, { teacher, world: () => this.currentWorld() });
      this.set({ mode: this.provider.mode, model: this.provider.mode === "demo" ? "scripted lesson (not AI)" : null });
      await this.provider.connect();
      this.set({ sessionStartedAt: Date.now() });
      if (this.sessionCap) clearTimeout(this.sessionCap);
      this.sessionCap = setTimeout(() => {
        this.stop();
        this.set({ banner: { kind: "info", text: `That's the ${MAX_MIN}-minute session limit. Great work today!` } });
      }, MAX_MIN * 60_000);
    } catch (err) {
      this.provider?.disconnect();
      this.provider = undefined;
      this.set({ status: "disconnected", banner: { kind: "error", text: `Could not start the lesson. ${err instanceof Error ? err.message : ""}` } });
    }
  }

  stop() {
    if (this.transitWatchdog) clearTimeout(this.transitWatchdog);
    if (this.flushTimer) clearTimeout(this.flushTimer);
    if (this.strandTimer) clearTimeout(this.strandTimer);
    this.lastPrompt = undefined;
    this.listenRequested = false;
    if (this.sessionCap) clearTimeout(this.sessionCap);
    if (this.timeout) clearTimeout(this.timeout);
    this.provider?.cancelListening?.();
    this.provider?.disconnect();
    this.provider = undefined;
  }

  // ------------------------------------------------------------------ input
  /** Any child input (typed, tapped, chosen, answered) starts a new turn. */
  private userInput(input: BrainInput, label: string, kind: "text" | "voice" = "text") {
    if (!this.provider || this.s.status !== "connected") return;
    this.provider.cancelListening?.();
    this.lastPrompt = undefined;
    // Moving on (a choice, a new question): put the inspected object back.
    if (input.kind === "choice" || input.kind === "text") this.set({ inspecting: null, question: null });
    this.dispatch({ type: "USER_TEXT" });
    const turnId = this.s.conv.turnId;
    this.line("child", label, turnId);
    this.timings.set(turnId, { turnId, mode: this.provider.mode, input: kind, cold: !this.firstTurnDone, textSubmit: performance.now() });
    this.firstTurnDone = true;
    this.armTimeout(turnId);
    if (input.kind === "text") this.provider.sendText(input.text);
    else this.provider.sendEvent(input);
  }

  sendText(text: string) {
    const clean = text.trim().slice(0, 500);
    if (clean) this.userInput({ kind: "text", text: clean }, clean);
  }

  choose(id: string) {
    const c = this.s.choices.find((x) => x.id === id);
    if (!c) return;
    this.set({ choices: [] });
    this.userInput({ kind: "choice", id: c.id, label: c.label }, c.label);
  }

  answer(optionId: string) {
    const q = this.s.question;
    if (!q) return;
    const opt = WORLDS[q.world].questions[q.id]?.options.find((o) => o.id === optionId);
    if (!opt) return;
    this.set({ question: null });
    this.userInput({ kind: "answer", questionId: q.id, optionId }, opt.label);
  }

  /** The child tapped an object in the 3D world. */
  tap(target: string) {
    if (this.s.transit || !WORLDS[this.s.world].interactive[target]) return;
    this.set({ inspecting: target, invite: null });
    this.userInput({ kind: "tap", target }, `(tapped the ${WORLDS[this.s.world].interactive[target].label.toLowerCase()})`);
  }

  closeInspect() { this.set({ inspecting: null }); }

  /** Tap-to-talk. Tapping while the teacher talks interrupts him first. */
  talk() {
    if (!this.provider?.listenOnce || this.s.status !== "connected") return;
    if (this.s.listening) {
      this.provider.cancelListening?.();
      this.listenRequested = false;
      this.set({ listening: false, interim: "" });
      this.dispatch({ type: "LISTEN_CANCELLED" });
      return;
    }
    // Always silence the teacher, including a line that is about to start
    // (greeting / arrival) while the state still says idle.
    this.systemReplyPending = false;
    if (this.s.conv.state === "speaking" || this.s.conv.state === "thinking") this.interrupt();
    else this.provider.interrupt();
    this.set({ banner: null });
    this.listenRequested = true;
    this.provider.listenOnce();
  }

  interrupt() {
    this.provider?.interrupt();
    this.dispatch({ type: "INTERRUPT" });
    this.flushSoon();
    this.guardStranded();
  }

  private rememberPrompt() {
    const { choices, question, invite, world } = this.s;
    this.lastPrompt = { world, choices, question, invite };
  }

  /**
   * Never leave the child idle with nothing to answer or tap. After Stop or a
   * failed mic tap, wait for any queued line (flushSoon, 1.2 s); if the screen
   * is still empty, put back the unanswered prompt silently, or ask the brain
   * for a short nudge when there is none for this world.
   */
  private guardStranded() {
    if (this.strandTimer) clearTimeout(this.strandTimer);
    const turn = this.s.conv.turnId;
    this.strandTimer = setTimeout(() => {
      const s = this.s;
      if (s.status !== "connected" || s.conv.state !== "idle" || s.conv.turnId !== turn) return;
      if (s.listening || this.listenRequested || s.transit || this.queued.length || this.systemReplyPending) return;
      if (s.choices.length || s.question || s.invite || s.inspecting) return;
      const p = this.lastPrompt;
      if (p && p.world === s.world) this.set({ choices: p.choices, question: p.question, invite: p.invite });
      else this.deliverSystem({ kind: "resume" });
    }, STRAND_GUARD_MS);
  }

  /**
   * After an interrupt, a queued line (e.g. "We made it to Mars!") must not be
   * lost, or the child lands in silence with nothing to tap. Deliver it after a
   * short pause, unless the child has started talking or typing by then.
   */
  private flushSoon() {
    // The mid-flight remark is optional: Stop means quiet. Arrival lines are kept.
    this.queued = this.queued.filter((q) => q.kind !== "transit_cruise");
    if (!this.queued.length) return;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    const turn = this.s.conv.turnId;
    this.flushTimer = setTimeout(() => {
      if (this.s.conv.state === "idle" && this.s.conv.turnId === turn && !this.s.listening && !this.listenRequested) this.flushQueued();
    }, 1200);
  }

  outputLevel() { return this.provider?.getOutputLevel() ?? 0; }
  inputLevel() { return this.provider?.getInputLevel() ?? 0; }

  storedResults(): (TurnResult & { at: string })[] {
    try { return JSON.parse(localStorage.getItem(RESULTS_KEY) || "[]"); } catch { return []; }
  }
  clearStoredResults() { try { localStorage.removeItem(RESULTS_KEY); } catch {} this.set({ results: [] }); }
}

export const session = new SessionController();
