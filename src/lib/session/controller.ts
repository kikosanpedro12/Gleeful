import { useSession, emptyUsage } from "./store";
import { reduce, type ConvEvent } from "@/lib/teacher/stateMachine";
import { parseToolCall } from "@/lib/scene/commands";
import { toResult, type TurnTiming, type TurnResult } from "@/lib/telemetry/latency";
import type { VoiceEvents, VoiceProvider } from "@/lib/voice/provider";
import { OpenAIRealtimeProvider } from "@/lib/voice/openaiRealtime";
import { DemoProvider } from "@/lib/voice/demoProvider";

/**
 * Single owner of conversation flow. Voice provider events come in here, pass
 * through the pure state machine, and come out as store state that the 3D
 * teacher reads. Everything is tagged with a turn id; stale output is dropped.
 */
const RESPONSE_TIMEOUT_MS = 12000;
const RESULTS_KEY = "aiteacher.latency.v1";
const MAX_MIN = Number(process.env.NEXT_PUBLIC_MAX_SESSION_MINUTES || 15);

class SessionController {
  private provider?: VoiceProvider;
  private responseTurn = new Map<string, number>();
  private timings = new Map<number, TurnTiming>();
  private timeout?: ReturnType<typeof setTimeout>;
  private sessionCap?: ReturnType<typeof setTimeout>;
  private firstTurnDone = false;
  private seq = 0;
  private greetingPending = false;

  get set() { return useSession.setState; }
  get s() { return useSession.getState(); }

  private dispatch(e: ConvEvent) {
    const before = this.s.conv;
    const conv = reduce(before, e);
    if (conv === before) return;
    const patch: Partial<ReturnType<typeof useSession.getState>> = { conv };
    if (conv.turnId !== before.turnId) {
      // New turn: anything queued for the old one is obsolete.
      this.greetingPending = false;
      const dropped = this.s.directives.length;
      patch.directives = [];
      if (dropped) patch.staleDropped = this.s.staleDropped + dropped;
      this.finalize(before.turnId, conv.interrupted);
    }
    this.set(patch);
  }

  private finalize(turnId: number, interrupted = false) {
    const t = this.timings.get(turnId);
    if (!t) return;
    this.timings.delete(turnId);
    if (interrupted && t.firstAudio === undefined) t.interrupted = true;
    const r = toResult(t);
    const results = [...this.s.results, r];
    this.set({ results });
    try {
      const prev: unknown[] = JSON.parse(localStorage.getItem(RESULTS_KEY) || "[]");
      prev.push({ ...r, at: new Date().toISOString(), ua: navigator.userAgent, net: (navigator as any).connection?.effectiveType ?? "unknown", model: this.s.model });
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
      this.provider?.interrupt(); // a late reply must not start talking after we gave up
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

  private events: VoiceEvents = {
    onStatus: (status, detail) => {
      this.set({ status });
      if (status === "connected") {
        this.dispatch({ type: "CONNECTED" });
        this.set({ micAvailable: this.provider?.micAvailable ?? false });
        if (!this.provider?.micAvailable)
          this.set({ banner: { kind: "info", text: "Microphone is off or blocked. You can type to your teacher instead." } });
        this.greetingPending = true;
        this.provider?.greet();
      }
      if (status === "disconnected") {
        if (this.sessionCap) clearTimeout(this.sessionCap);
        if (this.timeout) clearTimeout(this.timeout);
        this.dispatch({ type: "DISCONNECTED" });
        if (detail) this.set({ banner: { kind: "error", text: `${detail} Tap Start to reconnect.` } });
      }
    },
    onUserSpeechStart: () => this.dispatch({ type: "USER_SPEECH_START" }),
    onUserSpeechStop: (t, utteranceEnd) => {
      // Only a turn we are actually listening to; a late event must not clobber a typed turn.
      if (this.s.conv.state !== "listening") return;
      this.dispatch({ type: "USER_SPEECH_STOP" });
      const turnId = this.s.conv.turnId;
      this.timings.set(turnId, { turnId, mode: this.provider!.mode, input: "voice", cold: !this.firstTurnDone, vadEnd: t, utteranceEnd });
      this.firstTurnDone = true;
      this.armTimeout(turnId);
    },
    onUserTranscript: (text) => this.line("child", text, this.s.conv.turnId),
    onResponseCreated: (id) => {
      // Second safety net (the provider's ResponseGate is the first): a reply may
      // only attach to a turn that is waiting for one — after input ("thinking"),
      // mid-reply ("speaking", tool follow-up) or the opening greeting. A reply
      // arriving at any other time belongs to a cancelled turn: stop it.
      const st = this.s.conv.state;
      if (st === "thinking" || st === "speaking" || this.greetingPending) {
        this.greetingPending = false;
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
    onAssistantTranscript: (id, delta) => {
      const turnId = this.responseTurn.get(id);
      if (turnId === undefined || turnId !== this.s.conv.turnId) return;
      this.line("teacher", delta, turnId, true);
    },
    onToolCall: (id, callId, name, args) => {
      const turnId = this.responseTurn.get(id);
      // Stale: the conversation has moved on. Never touch the scene.
      if (turnId === undefined || turnId !== this.s.conv.turnId) {
        this.set({ staleDropped: this.s.staleDropped + 1 });
        this.provider?.submitToolResult(callId, JSON.stringify({ ok: false, error: "cancelled: the child started a new turn" }));
        return;
      }
      const parsed = parseToolCall(name, args);
      if (!parsed.ok) {
        this.set({ rejectedCommands: this.s.rejectedCommands + 1 });
        this.provider?.submitToolResult(callId, JSON.stringify({ ok: false, error: parsed.error }));
        return;
      }
      if (parsed.command.name === "writeOnBoard") this.set({ boardText: parsed.command.text });
      this.set({ directives: [...this.s.directives, { id: ++this.seq, turnId, command: parsed.command }] });
      this.provider?.submitToolResult(callId, JSON.stringify({ ok: true }));
    },
    onUsage: (u) => {
      const p = this.s.usage;
      this.set({ usage: {
        inputTokens: p.inputTokens + u.inputTokens, outputTokens: p.outputTokens + u.outputTokens,
        inputAudioTokens: p.inputAudioTokens + u.inputAudioTokens, outputAudioTokens: p.outputAudioTokens + u.outputAudioTokens,
        cachedTokens: p.cachedTokens + u.cachedTokens, responses: p.responses + 1 } });
    },
    onError: (message) => this.set({ banner: { kind: "error", text: message } }),
  };

  /** Called by the 3D teacher the first frame it animates a spoken reply or gesture for a turn. */
  markAnimation(turnId: number) {
    const t = this.timings.get(turnId);
    if (t && t.firstAnimation === undefined) t.firstAnimation = performance.now();
  }

  async start(accessCode?: string) {
    if (this.s.status !== "disconnected") return;
    this.set({ banner: null, status: "connecting", transcript: [], usage: { ...emptyUsage }, directives: [], boardText: "Ask me anything!" });
    this.firstTurnDone = false;
    this.greetingPending = false;
    this.responseTurn.clear();
    let token: { value: string; model?: string; degraded?: boolean } | null = null;
    let demoReason: string | null = null;
    try {
      const res = await fetch("/api/realtime/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessCode }) });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.value) token = body;
      else if (body.code === "NO_KEY") demoReason = "No API key on the server";
      else {
        this.set({ status: "disconnected", banner: { kind: "error", text: body.message || `Could not start a live session (${res.status}).` } });
        return;
      }
    } catch {
      this.set({ status: "disconnected", banner: { kind: "error", text: "Cannot reach the server. Check your connection and try again." } });
      return;
    }
    try {
      if (token) {
        const t = token;
        this.provider = new OpenAIRealtimeProvider(this.events, async () => t);
        this.set({ mode: "live", demoReason: null, model: t.model ? `${t.model}${t.degraded ? " (fallback session config)" : ""}` : null });
      } else {
        this.provider = new DemoProvider(this.events);
        this.set({ mode: "demo", demoReason, model: null });
      }
      await this.provider.connect();
      this.set({ sessionStartedAt: Date.now(), micEnabled: true });
      if (this.sessionCap) clearTimeout(this.sessionCap);
      this.sessionCap = setTimeout(() => {
        this.stop();
        this.set({ banner: { kind: "info", text: `That's the ${MAX_MIN}-minute session limit. Great work today!` } });
      }, MAX_MIN * 60_000);
    } catch (err) {
      this.provider?.disconnect();
      this.provider = undefined;
      this.set({ status: "disconnected", banner: { kind: "error", text: `Could not connect to the teacher. ${err instanceof Error ? err.message : ""}` } });
    }
  }

  stop() {
    if (this.sessionCap) clearTimeout(this.sessionCap);
    if (this.timeout) clearTimeout(this.timeout);
    this.provider?.disconnect();
    this.provider = undefined;
  }

  sendText(text: string) {
    const clean = text.trim().slice(0, 500);
    if (!clean || !this.provider || this.s.status !== "connected") return;
    this.dispatch({ type: "USER_TEXT" });
    const turnId = this.s.conv.turnId;
    this.line("child", clean, turnId);
    this.timings.set(turnId, { turnId, mode: this.provider.mode, input: "text", cold: !this.firstTurnDone, textSubmit: performance.now() });
    this.firstTurnDone = true;
    this.armTimeout(turnId);
    this.provider.sendText(clean);
  }

  interrupt() {
    this.provider?.interrupt();
    this.dispatch({ type: "INTERRUPT" });
  }

  toggleMic() {
    const micEnabled = !this.s.micEnabled;
    this.provider?.setMicEnabled(micEnabled);
    this.set({ micEnabled });
  }

  outputLevel() { return this.provider?.getOutputLevel() ?? 0; }
  inputLevel() { return this.provider?.getInputLevel() ?? 0; }

  storedResults(): (TurnResult & { at: string; ua: string; net: string })[] {
    try { return JSON.parse(localStorage.getItem(RESULTS_KEY) || "[]"); } catch { return []; }
  }
  clearStoredResults() { try { localStorage.removeItem(RESULTS_KEY); } catch {} this.set({ results: [] }); }
}

export const session = new SessionController();
