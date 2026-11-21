import { describe, expect, it, vi } from "vitest";
import { readEnv } from "@/lib/brain/server/config";
import { handleVoice, makeElevenDeps, readElevenEnv, voiceStatus } from "@/lib/tts/elevenHandler";

vi.mock("server-only", () => ({}));

const pcm = () => new Response(new Uint8Array([1, 0, 2, 0]), { status: 200 });
const make = (extra: Record<string, string> = {}, parent?: () => Promise<{ id: string; consented: boolean } | null>, brain: Record<string, string> = {}) =>
  makeElevenDeps({ env: readElevenEnv({ ELEVENLABS_API_KEY: "k", ...extra }), brainEnv: readEnv(brain), fetchImpl: vi.fn(async () => pcm()) as unknown as typeof fetch, parent });
const post = (headers: Record<string, string> = {}, text = "Hello there, friend!", ip = "1.1.1.1") =>
  new Request("http://localhost/api/voice", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip, ...headers }, body: JSON.stringify({ text, teacher: "mia" }) });
const PUB = { "x-gleeful-voice": "public" };

describe("public voice taste", () => {
  it("is closed unless ELEVEN_PUBLIC=on (no passcode, no public)", async () => {
    expect((await handleVoice(post(PUB), make({ ELEVEN_LANDING: "off" }))).status).toBe(503);
    expect((await handleVoice(post(PUB), make())).status).toBe(403); // landing pool on: the public header alone still gets nothing
    expect((await handleVoice(post(PUB), make({}, undefined, { TESTER_INVITES: "a:aaaaaaaaaaaaaaaaaaaa" }))).status).toBe(403);
  });
  it("lets an anonymous visitor a small per-address taste, then 429", async () => {
    const d = make({ ELEVEN_PUBLIC: "on", ELEVEN_ANON_IP_CHARS: "50" });
    expect((await handleVoice(post(PUB), d)).status).toBe(200); // 20 chars
    expect((await handleVoice(post(PUB), d)).status).toBe(200); // 40
    expect((await handleVoice(post(PUB), d)).status).toBe(429); // 60 > 50
    expect((await handleVoice(post(PUB, "Hello there, friend!", "2.2.2.2"), d)).status).toBe(200); // other address, own bucket
  });
  it("shares one pool among anonymous visitors so many addresses cannot drain the site", async () => {
    const d = make({ ELEVEN_PUBLIC: "on", ELEVEN_ANON_POOL_CHARS: "40" });
    expect((await handleVoice(post(PUB, "Hello there, friend!", "3.3.3.1"), d)).status).toBe(200);
    expect((await handleVoice(post(PUB, "Hello there, friend!", "3.3.3.2"), d)).status).toBe(200);
    expect((await handleVoice(post(PUB, "Hello there, friend!", "3.3.3.3"), d)).status).toBe(429);
  });
  it("refuses a request that does not ask for the public taste and has no passcode or parent", async () => {
    expect((await handleVoice(post(), make({ ELEVEN_PUBLIC: "on" }))).status).toBe(403);
  });
  it("gives a consenting parent a larger bucket; a parent without consent only gets the anonymous taste", async () => {
    const yes = make({ ELEVEN_PUBLIC: "on", ELEVEN_ANON_IP_CHARS: "10", ELEVEN_PARENT_CHARS: "100" }, async () => ({ id: "p1", consented: true }));
    expect((await handleVoice(post(), yes)).status).toBe(200);
    const no = make({ ELEVEN_PUBLIC: "on", ELEVEN_ANON_IP_CHARS: "10" }, async () => ({ id: "p2", consented: false }));
    expect((await handleVoice(post(PUB), no)).status).toBe(429);
    expect((await handleVoice(post(), no)).status).toBe(403);
  });
  it("a failing parent lookup is treated as signed out", async () => {
    const d = make({ ELEVEN_PUBLIC: "on" }, async () => { throw new Error("db"); });
    expect((await handleVoice(post(), d)).status).toBe(403);
    expect((await handleVoice(post(PUB), d)).status).toBe(200);
  });
  it("status says public only when on and configured", async () => {
    expect((await voiceStatus(new Request("http://localhost/api/voice"), make({ ELEVEN_PUBLIC: "on" }))).body).toMatchObject({ configured: true, public: true });
    expect((await voiceStatus(new Request("http://localhost/api/voice"), make({ ELEVEN_LANDING: "off" }))).body).toMatchObject({ configured: false, public: false, landing: false });
    expect((await voiceStatus(new Request("http://localhost/api/voice"), make())).body).toMatchObject({ configured: true, public: false, landing: true });
  });
});

describe("public voice accounting", () => {
  it("fake addresses cannot lock out a parent: anonymous table is separate and fails closed alone", async () => {
    let signedIn = false;
    const d = make({ ELEVEN_PUBLIC: "on" }, async () => (signedIn ? { id: "p9", consented: true } : null));
    for (let i = 0; i < 3000; i++) d.anon.set(`anon:10.0.${i >> 8}.${i & 255}`, { day: new Date().toISOString().slice(0, 10), chars: 0 });
    expect((await handleVoice(post(PUB, "Hi there", "9.9.9.9"), d)).status).toBe(503); // new anonymous address refused
    signedIn = true;
    expect((await handleVoice(post(), d)).status).toBe(200); // the consenting parent still works
  });
  it("a refused site ceiling does not charge the pool, and a clean upstream failure refunds it", async () => {
    const d = make({ ELEVEN_PUBLIC: "on", ELEVEN_DAILY_CHARS: "10" });
    expect((await handleVoice(post(PUB, "This line is longer than ten"), d)).status).toBe(429);
    expect(d.anon.get("anon-pool")?.chars ?? 0).toBe(0);
    const d2 = make({ ELEVEN_PUBLIC: "on" });
    (d2.fetchImpl as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Response("no", { status: 500 }));
    expect((await handleVoice(post(PUB), d2)).status).toBe(502);
    expect(d2.anon.get("anon-pool")?.chars).toBe(0);
  });
});
