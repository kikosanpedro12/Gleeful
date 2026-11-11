import { rms, type VoiceEvents, type VoiceProvider } from "./provider";
import { ResponseGate } from "./responseGate";

/**
 * OpenAI Realtime over WebRTC (GA interface, checked against the official
 * docs on 2026-11-12: POST /v1/realtime/client_secrets on our server, then the
 * browser posts its SDP offer to /v1/realtime/calls with the short-lived
 * secret; events flow on the "oai-events" data channel).
 *
 * STATUS: written to the documented interface but NOT yet exercised against
 * the live API (no key in the build environment). Treat as unverified until
 * the first real session is run.
 */
const CALLS_URL = "https://api.openai.com/v1/realtime/calls";
const AUDIBLE = 0.012; // output RMS that counts as audible speech
const MIC_VOICE = 0.02; // mic RMS that counts as the child making sound

interface ActiveResponse {
  id: string;
  audioStarted: boolean;
  bufferStartedAt?: number;
  transcriptAt?: number;
  done: boolean;
  quietSince?: number;
  toolCalls: Set<string>;
  hadSpeech: boolean;
}

export class OpenAIRealtimeProvider implements VoiceProvider {
  readonly mode = "live" as const;
  micAvailable = false;
  private pc?: RTCPeerConnection;
  private dc?: RTCDataChannel;
  private audioEl?: HTMLAudioElement;
  private ctx?: AudioContext;
  private outAn?: AnalyserNode;
  private inAn?: AnalyserNode;
  private buf = new Float32Array(1024);
  private mic?: MediaStream;
  private poll?: ReturnType<typeof setInterval>;
  private outLevel = 0;
  private inLevel = 0;
  private lastMicVoiceAt = 0;
  private active?: ActiveResponse;
  private pendingToolOutputs = 0;
  private closed = false;
  private gate = new ResponseGate();
  private dropTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private ev: VoiceEvents,
    private getToken: () => Promise<{ value: string }>,
  ) {}

  async connect() {
    this.ev.onStatus("connecting");
    const token = await this.getToken();
    const pc = (this.pc = new RTCPeerConnection());
    this.ctx = new AudioContext();
    void this.ctx.resume();

    this.audioEl = new Audio();
    this.audioEl.autoplay = true;
    pc.ontrack = (e) => {
      const stream = e.streams[0];
      this.audioEl!.srcObject = stream;
      // Tap (not route) the remote audio for mouth movement + audible-start timing.
      const src = this.ctx!.createMediaStreamSource(stream);
      this.outAn = this.ctx!.createAnalyser();
      this.outAn.fftSize = 1024;
      src.connect(this.outAn);
    };

    try {
      this.mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      this.micAvailable = true;
      pc.addTrack(this.mic.getAudioTracks()[0], this.mic);
      const msrc = this.ctx.createMediaStreamSource(this.mic);
      this.inAn = this.ctx.createAnalyser();
      this.inAn.fftSize = 1024;
      msrc.connect(this.inAn);
    } catch {
      // Mic denied/unavailable: still connect so typed conversation gets spoken answers.
      this.micAvailable = false;
      pc.addTransceiver("audio", { direction: "recvonly" });
    }

    const dc = (this.dc = pc.createDataChannel("oai-events"));
    dc.onmessage = (m) => this.onServerEvent(m.data);
    dc.onopen = () => this.ev.onStatus("connected");
    dc.onclose = () => this.handleClosed("The connection to the teacher closed.");
    pc.onconnectionstatechange = () => {
      if (this.dropTimer) clearTimeout(this.dropTimer);
      if (pc.connectionState === "failed") this.handleClosed("The connection to the teacher dropped.");
      // "disconnected" is often a short network blip on phones: give it a few seconds.
      else if (pc.connectionState === "disconnected")
        this.dropTimer = setTimeout(() => {
          if (pc.connectionState !== "connected") this.handleClosed("The connection to the teacher dropped.");
        }, 5000);
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const res = await fetch(CALLS_URL, {
      method: "POST",
      body: offer.sdp,
      headers: { Authorization: `Bearer ${token.value}`, "Content-Type": "application/sdp" },
    });
    if (!res.ok) throw new Error(`Realtime call failed (${res.status})`);
    await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });

    this.poll = setInterval(() => this.tick(), 10);
  }

  private handleClosed(detail: string) {
    if (this.closed) return;
    this.closed = true;
    this.cleanup();
    this.ev.onStatus("disconnected", detail);
  }

  disconnect() {
    if (this.closed) return;
    this.closed = true;
    this.cleanup();
    this.ev.onStatus("disconnected");
  }

  private cleanup() {
    if (this.poll) clearInterval(this.poll);
    if (this.dropTimer) clearTimeout(this.dropTimer);
    this.mic?.getTracks().forEach((t) => t.stop());
    try { this.dc?.close(); } catch {}
    try { this.pc?.close(); } catch {}
    if (this.audioEl) this.audioEl.srcObject = null;
    void this.ctx?.close().catch(() => {});
    this.outLevel = 0;
  }

  private send(obj: unknown) {
    if (this.dc?.readyState === "open") this.dc.send(JSON.stringify(obj));
  }

  /** 100 Hz: loudness + audible-start/stop detection, independent of render fps. */
  private tick() {
    const now = performance.now();
    if (this.inAn) {
      this.inLevel = rms(this.inAn, this.buf);
      if (this.inLevel > MIC_VOICE) this.lastMicVoiceAt = now;
    }
    const level = this.outAn ? rms(this.outAn, this.buf) : 0;
    this.outLevel = this.audioEl?.muted ? 0 : level;
    const a = this.active;
    if (!a) return;
    if (!a.audioStarted) {
      // Prefer real audible energy; fall back to the server's buffer event if
      // the analyser gives nothing (some browsers) 300 ms after it.
      // Last resort: the spoken transcript has started, so audio must be playing.
      const fallbackAt = a.bufferStartedAt && now - a.bufferStartedAt > 300 ? a.bufferStartedAt
        : a.transcriptAt && now - a.transcriptAt > 500 ? a.transcriptAt : undefined;
      if (level > AUDIBLE || fallbackAt !== undefined) {
        a.audioStarted = true;
        this.ev.onAudioStart(a.id, level > AUDIBLE ? now : fallbackAt!);
      }
    } else if (a.done) {
      if (level > AUDIBLE) a.quietSince = undefined;
      else if (a.quietSince === undefined) a.quietSince = now;
      else if (now - a.quietSince > 350) this.finish(a);
    }
  }

  private finish(a: ActiveResponse) {
    if (this.active === a) this.active = undefined;
    this.ev.onAudioStop(a.id);
  }

  private onServerEvent(raw: string) {
    let e: any;
    try { e = JSON.parse(raw); } catch { return; }
    const now = performance.now();
    switch (e.type) {
      case "input_audio_buffer.speech_started":
        // Server truncates unplayed audio itself on WebRTC; we also hard-mute so
        // nothing stale can be heard, and drop the active response.
        if (this.audioEl) this.audioEl.muted = true;
        this.active = undefined;
        this.dropPending();
        this.ev.onUserSpeechStart(now);
        break;
      case "input_audio_buffer.speech_stopped": {
        this.gate.expect(now); // the turn detector will now create a response
        const recent = this.lastMicVoiceAt && now - this.lastMicVoiceAt < 3000;
        this.ev.onUserSpeechStop(now, recent ? this.lastMicVoiceAt : undefined);
        break;
      }
      case "conversation.item.input_audio_transcription.completed":
        if (typeof e.transcript === "string" && e.transcript.trim()) this.ev.onUserTranscript(e.transcript.trim());
        break;
      case "response.created": {
        const id = e.response?.id ?? `r_${now}`;
        if (this.gate.onCreated(now) === "discard") {
          // A reply to a turn the child already cancelled (Stop pressed or new
          // input before it was created). Kill it; never map it or un-mute.
          // Cancel exactly this reply, so a newer one cannot be hit by mistake.
          this.send(e.response?.id ? { type: "response.cancel", response_id: e.response.id } : { type: "response.cancel" });
          this.send({ type: "output_audio_buffer.clear" });
          break;
        }
        this.active = { id, audioStarted: false, done: false, toolCalls: new Set(), hadSpeech: false };
        if (this.audioEl) this.audioEl.muted = false;
        this.ev.onResponseCreated(id);
        break;
      }
      case "output_audio_buffer.started":
        if (this.active && !this.active.bufferStartedAt) this.active.bufferStartedAt = now;
        break;
      case "output_audio_buffer.stopped":
        if (this.active?.audioStarted) this.finish(this.active);
        break;
      case "response.output_audio_transcript.delta":
        if (this.active) {
          this.active.hadSpeech = true;
          if (this.active.transcriptAt === undefined) this.active.transcriptAt = now;
        }
        if (e.response_id && typeof e.delta === "string") this.ev.onAssistantTranscript(e.response_id, e.delta);
        break;
      case "response.done": {
        const r = e.response ?? {};
        const a = this.active && this.active.id === r.id ? this.active : undefined;
        const u = r.usage;
        if (u)
          this.ev.onUsage({
            inputTokens: u.input_tokens ?? 0,
            outputTokens: u.output_tokens ?? 0,
            inputAudioTokens: u.input_token_details?.audio_tokens ?? 0,
            outputAudioTokens: u.output_token_details?.audio_tokens ?? 0,
            cachedTokens: u.input_token_details?.cached_tokens ?? 0,
          });
        const calls: { call_id: string; name: string; arguments: string }[] = [];
        for (const item of r.output ?? []) {
          if (item?.type === "function_call" && item.call_id)
            calls.push({ call_id: item.call_id, name: String(item.name), arguments: String(item.arguments ?? "{}") });
        }
        const failed = r.status === "failed"; // "incomplete" still has audio to play out
        if (failed) {
          this.ev.onResponseFailed(r.id, r.status_details?.error?.message ?? r.status);
          if (a) this.active = undefined;
        } else if (a) {
          a.done = true;
          // Tool-only response (no speech): nothing audible will arrive.
          if (!a.audioStarted && !a.hadSpeech) {
            this.active = undefined;
            if (calls.length) this.continueAfterTools = true;
            else if (r.status !== "cancelled") this.ev.onResponseFailed(r.id, "no audio in response");
          }
        }
        // Dispatch after flags are set: the controller answers synchronously.
        this.pendingToolOutputs += calls.length;
        for (const c of calls) this.ev.onToolCall(r.id, c.call_id, c.name, c.arguments);
        break;
      }
      case "error": {
        const msg = String(e.error?.message ?? "Realtime error");
        // Cancelling when nothing is active is expected and harmless.
        if (/cancel|no active response/i.test(msg) || /cancel/i.test(String(e.error?.code ?? ""))) break;
        this.ev.onError(msg);
        break;
      }
    }
  }

  private continueAfterTools = false;

  submitToolResult(callId: string, output: string) {
    this.send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: callId, output } });
    this.pendingToolOutputs = Math.max(0, this.pendingToolOutputs - 1);
    // Only ask for a follow-up when the model called tools without speaking;
    // otherwise it would talk twice.
    if (this.pendingToolOutputs === 0 && this.continueAfterTools) {
      this.continueAfterTools = false;
      this.gate.expect(performance.now());
      this.send({ type: "response.create" });
    }
  }

  /** Anything requested but not yet created is now unwanted. */
  private dropPending() {
    this.gate.dropPending(performance.now());
    this.continueAfterTools = false;
  }

  sendText(text: string) {
    this.interrupt();
    this.send({
      type: "conversation.item.create",
      item: { type: "message", role: "user", content: [{ type: "input_text", text }] },
    });
    this.gate.expect(performance.now());
    this.send({ type: "response.create" });
  }

  interrupt() {
    // Always cancel: a reply may be in progress on the server before we have
    // seen its response.created. ("Nothing to cancel" errors are ignored.)
    this.send({ type: "response.cancel" });
    if (this.active) {
      this.send({ type: "output_audio_buffer.clear" });
      this.active = undefined;
    }
    this.dropPending(); // covers Stop pressed while still "thinking"
    if (this.audioEl) this.audioEl.muted = true; // un-muted on the next accepted response.created
  }

  greet() {
    // Added as a conversation item so the session instructions (incl. safety rules) still apply.
    this.send({
      type: "conversation.item.create",
      item: { type: "message", role: "system", content: [{ type: "input_text", text: "The session has just started. Greet the child in one short friendly sentence, say you are their AI teacher, wave, and ask what they would like to learn about today." }] },
    });
    this.gate.expect(performance.now());
    this.send({ type: "response.create" });
  }

  setMicEnabled(enabled: boolean) {
    this.mic?.getAudioTracks().forEach((t) => (t.enabled = enabled));
  }
  getOutputLevel() { return this.outLevel; }
  getInputLevel() { return this.inLevel; }
}
