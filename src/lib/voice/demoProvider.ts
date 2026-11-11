import { rms, type VoiceEvents, type VoiceProvider } from "./provider";

/**
 * DEMO MODE — NOT AI. Deterministic scripted replies so the animation,
 * interruption, cancellation and telemetry pipeline can be exercised without
 * credentials. It cannot understand speech: the mic only drives a local
 * loudness detector. Voice is the browser's built-in speech synthesis and the
 * mouth follows a synthetic envelope. Timings from this mode are tagged
 * "demo" and never count toward the live latency target.
 */
interface Script { say: string; tools?: { name: string; args: object }[] }

const SCRIPTS: { match: RegExp; script: Script }[] = [
  { match: /red|rust|colou?r/i, script: { say: "Mars looks red because iron in its rocks and dust has rusted. Look at this globe. What else have you seen that turns reddish brown when it rusts?", tools: [{ name: "pointAt", args: { target: "mars_globe" } }] } },
  { match: /mars|planet|space/i, script: { say: "Mars is the fourth planet from the Sun. I will write it on the board. What would you like to know about it?", tools: [{ name: "moveTeacherTo", args: { spot: "board_side" } }, { name: "writeOnBoard", args: { text: "Mars: 4th planet from the Sun" } }, { name: "pointAt", args: { target: "board" } }] } },
  { match: /go there|travel|visit|trip/i, script: { say: "The Mars trip is still being built, so today we will explore with the globe on my desk.", tools: [{ name: "pointAt", args: { target: "mars_globe" } }] } },
  { match: /hello|hi\b|hey/i, script: { say: "Hello! This is demo mode, so my answers are scripted.", tools: [{ name: "gesture", args: { gesture: "wave" } }] } },
  { match: /book|read/i, script: { say: "There are some books on the shelf over there.", tools: [{ name: "pointAt", args: { target: "bookshelf" } }] } },
];
const FALLBACK: Script = { say: "This is demo mode, so I can only give a few scripted answers. Try typing: why is Mars red?", tools: [{ name: "gesture", args: { gesture: "shrug" } }] };
const HEARD: Script = { say: "I heard a sound, but demo mode cannot understand speech. Please type your question, or add an API key for live conversation.", tools: [{ name: "gesture", args: { gesture: "open_hands" } }] };
const GREETING: Script = { say: "Hi! I am Leo, an AI teacher. This is demo mode: my replies are scripted, not live AI.", tools: [{ name: "gesture", args: { gesture: "wave" } }] };

const THINK_MS = 600; // simulated model delay

export class DemoProvider implements VoiceProvider {
  readonly mode = "demo" as const;
  micAvailable = false;
  private seq = 0;
  private current?: { id: string; cancelled: boolean; timers: ReturnType<typeof setTimeout>[]; speaking: boolean };
  private level = 0;
  private envelope?: ReturnType<typeof setInterval>;
  private ctx?: AudioContext;
  private inAn?: AnalyserNode;
  private mic?: MediaStream;
  private buf = new Float32Array(1024);
  private inLevel = 0;
  private vad?: ReturnType<typeof setInterval>;
  private micEnabled = true;

  constructor(private ev: VoiceEvents) {}

  async connect() {
    this.ev.onStatus("connecting");
    try {
      this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true } });
      this.ctx = new AudioContext();
      const src = this.ctx.createMediaStreamSource(this.mic);
      this.inAn = this.ctx.createAnalyser();
      this.inAn.fftSize = 1024;
      src.connect(this.inAn);
      this.micAvailable = true;
      this.startLocalVad();
    } catch {
      this.micAvailable = false;
    }
    this.ev.onStatus("connected");
  }

  /** Simple energy detector: start after 150 ms of sound, stop after 800 ms of quiet. */
  private startLocalVad() {
    let loudSince = 0, lastLoud = 0, inSpeech = false;
    this.vad = setInterval(() => {
      if (!this.inAn) return;
      const now = performance.now();
      this.inLevel = this.micEnabled ? rms(this.inAn, this.buf) : 0;
      // Ignore the mic while our own TTS is playing unless clearly loud (no AEC on TTS).
      const threshold = this.current?.speaking ? 0.12 : 0.045;
      if (this.inLevel > threshold) {
        lastLoud = now;
        if (!loudSince) loudSince = now;
        if (!inSpeech && now - loudSince > 150) {
          inSpeech = true;
          this.cancelCurrent();
          this.ev.onUserSpeechStart(now);
        }
      } else {
        if (now - lastLoud > 200) loudSince = 0;
        if (inSpeech && now - lastLoud > 800) {
          inSpeech = false;
          this.ev.onUserSpeechStop(now, lastLoud);
          this.respond(HEARD);
        }
      }
    }, 20);
  }

  disconnect() {
    this.cancelCurrent();
    if (this.vad) clearInterval(this.vad);
    this.mic?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close().catch(() => {});
    this.ev.onStatus("disconnected");
  }

  private cancelCurrent() {
    const c = this.current;
    if (!c) return;
    c.cancelled = true;
    c.timers.forEach(clearTimeout);
    if (this.envelope) clearInterval(this.envelope);
    this.level = 0;
    try { window.speechSynthesis?.cancel(); } catch {}
    this.current = undefined;
  }

  private respond(script: Script) {
    this.cancelCurrent();
    const id = `demo_${++this.seq}`;
    const c = (this.current = { id, cancelled: false, timers: [] as ReturnType<typeof setTimeout>[], speaking: false });
    this.ev.onResponseCreated(id);
    c.timers.push(setTimeout(() => {
      if (c.cancelled) return;
      script.tools?.forEach((t, i) => this.ev.onToolCall(id, `${id}_c${i}`, t.name, JSON.stringify(t.args)));
      this.speak(c, script.say);
    }, THINK_MS));
  }

  private speak(c: NonNullable<DemoProvider["current"]>, text: string) {
    const start = () => {
      if (c.cancelled || c.speaking) return;
      c.speaking = true;
      this.ev.onAudioStart(c.id, performance.now());
      this.ev.onAssistantTranscript(c.id, text);
      const t0 = performance.now();
      this.envelope = setInterval(() => {
        const t = (performance.now() - t0) / 1000;
        // Synthetic syllable-ish envelope (~4.5 Hz) — NOT derived from the audio.
        this.level = 0.05 + 0.11 * Math.abs(Math.sin(t * Math.PI * 4.5)) * (0.6 + 0.4 * Math.sin(t * 1.7 + 1));
      }, 16);
    };
    const end = () => {
      if (c.cancelled || this.current !== c) return;
      if (this.envelope) clearInterval(this.envelope);
      this.level = 0;
      this.current = undefined;
      this.ev.onAudioStop(c.id);
    };
    const est = Math.max(1500, text.length * 62);
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    let usedSynth = false;
    if (synth && typeof SpeechSynthesisUtterance !== "undefined") {
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 0.95;
        u.onstart = () => { usedSynth = true; start(); };
        u.onend = end;
        u.onerror = () => { if (!usedSynth) return; end(); };
        synth.speak(u);
      } catch {}
    }
    // If the browser has no working TTS, still run the timeline silently.
    c.timers.push(setTimeout(() => { if (!usedSynth) { start(); c.timers.push(setTimeout(end, est)); } }, 400));
    // Safety: never hang in "speaking".
    c.timers.push(setTimeout(end, est + 8000));
  }

  sendText(text: string) {
    const hit = SCRIPTS.find((s) => s.match.test(text));
    this.respond(hit ? hit.script : FALLBACK);
  }
  interrupt() { this.cancelCurrent(); }
  greet() { this.respond(GREETING); }
  setMicEnabled(enabled: boolean) { this.micEnabled = enabled; }
  getOutputLevel() { return this.level; }
  getInputLevel() { return this.inLevel; }
  submitToolResult() {}
}
