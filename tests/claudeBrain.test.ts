import { describe, expect, it, vi } from "vitest";
import { ClaudeBrain, BrainUnavailable, checkReply, resetProbeCache } from "@/lib/brain/claudeBrain";
import { FallbackBrain } from "@/lib/brain/fallbackBrain";
import { createBrain } from "@/lib/brain";
import { ScriptedBrain } from "@/lib/brain/scriptedBrain";
import { emptyProfile, type LearnerProfile } from "@/lib/learner/profile";
import type { BrainContext, BrainInput, BrainReply } from "@/lib/brain/types";
import type { BrainRequest } from "@/lib/brain/protocol";
import { parseRequest } from "@/lib/brain/server/request";

function ctx(world: BrainContext["world"] = "mars", profile: LearnerProfile = emptyProfile(), session = 1): BrainContext {
  profile.sessions = session;
  return { world, teacher: "leo", teacherName: "Leo", profile, session, record: (a) => profile.attempts.push({ ...a, session, at: "2026-11-13T00:00:00Z" }) };
}
const ok = (segments: unknown) => new Response(JSON.stringify({ segments, model: "default" }), { status: 200 });
const fetchOf = (...rs: (Response | Error)[]) => {
  const q = [...rs];
  return vi.fn(async (_u: unknown, _i?: unknown) => { const r = q.shift() ?? q[0]; if (r instanceof Error) throw r; return r!.clone(); });
};
const body = (f: ReturnType<typeof fetchOf>, n = 0) => JSON.parse((f.mock.calls[n][1] as { body: string }).body) as BrainRequest;
const brain = (f: ReturnType<typeof fetchOf>) => new ClaudeBrain({ fetchImpl: f as unknown as typeof fetch });
const ask = [{ say: "What colour do you think?", actions: [{ name: "askQuestion", args: { questionId: "q_red" } }] }];

describe("ClaudeBrain (browser side)", () => {
  it("sends a small structured request the server accepts, and returns the reply", async () => {
    const f = fetchOf(ok([{ say: "Hello!" }]));
    const profile = emptyProfile();
    const r = await brain(f).respond({ kind: "text", text: "hi leo" }, ctx("mars", profile));
    expect(r.segments).toEqual([{ say: "Hello!" }]);
    const sent = body(f);
    expect(parseRequest(sent).ok).toBe(true);
    expect(JSON.stringify(sent)).not.toMatch(/api|key|facts|tools/i);
    expect((f.mock.calls[0][1] as { credentials: string }).credentials).toBe("same-origin");
  });
  it("keeps a short rolling history and sends it next turn", async () => {
    const f = fetchOf(ok([{ say: "Hi, I'm Leo." }]), ok([{ say: "Nice name!" }]));
    const b = brain(f), c = ctx("classroom");
    await b.respond({ kind: "text", text: "I'm Sam" }, c);
    await b.respond({ kind: "text", text: "what is Mars" }, c);
    expect(body(f, 1).history).toEqual([{ role: "child", text: "I'm Sam" }, { role: "teacher", text: "Hi, I'm Leo." }]);
  });
  it("throws BrainUnavailable with the server's code on any error status", async () => {
    for (const [status, code] of [[503, "brain_unconfigured"], [429, "daily_limit"], [502, "bad_model_output"]] as const) {
      const f = fetchOf(new Response(JSON.stringify({ error: code }), { status }));
      await expect(brain(f).respond({ kind: "session_start" }, ctx("classroom"))).rejects.toMatchObject({ code, status });
    }
    await expect(brain(fetchOf(new TypeError("offline"))).respond({ kind: "resume" }, ctx())).rejects.toMatchObject({ code: "network" });
    await expect(brain(fetchOf(Object.assign(new Error("a"), { name: "AbortError" }))).respond({ kind: "resume" }, ctx())).rejects.toMatchObject({ code: "timeout" });
  });
  it("rejects a reply of the wrong shape (never trusts the network)", () => {
    for (const bad of [null, {}, { segments: [] }, { segments: "x" }, { segments: [{ say: "" }] }, { segments: [{ say: 5 }] }, { segments: [{ say: "ok", actions: [{ name: 1, args: {} }] }] },
      { segments: [{ say: "ok", actions: [{ name: "gesture", args: [] }] }] }, { segments: Array.from({ length: 5 }, () => ({ say: "x" })) }]) {
      expect(() => checkReply(bad), JSON.stringify(bad)).toThrow(BrainUnavailable);
    }
  });
});

describe("ClaudeBrain: learner evidence is recorded by code, from the question data", () => {
  const answer = (optionId: string): BrainInput => ({ kind: "answer", questionId: "q_red", optionId });
  it("right first time: recorded as taught with no hints", async () => {
    const f = fetchOf(ok(ask), ok([{ say: "Yes!" }]));
    const b = brain(f), p = emptyProfile(), c = ctx("mars", p);
    await b.respond({ kind: "tap", target: "rock_1" }, c);
    await b.respond(answer("rust"), c);
    expect(p.attempts).toMatchObject([{ skill: "science.mars.red_color", questionId: "q_red", answerId: "rust", correct: true, hintsUsed: 0, context: "taught" }]);
    expect(body(f, 1).hintsUsed).toBe(0);
  });
  it("first miss is a hint and a retry, not evidence; second miss is recorded as incorrect", async () => {
    const f = fetchOf(ok(ask), ok([{ say: "Hint…" }]), ok([{ say: "Explain…" }]));
    const b = brain(f), p = emptyProfile(), c = ctx("mars", p);
    await b.respond({ kind: "tap", target: "rock_1" }, c);
    await b.respond(answer("hot"), c);
    expect(p.attempts).toHaveLength(0);
    expect(body(f, 1).hintsUsed).toBe(0);
    await b.respond(answer("sun"), c);
    expect(body(f, 2).hintsUsed).toBe(1);
    expect(p.attempts).toMatchObject([{ correct: false, hintsUsed: 1, answerId: "sun", context: "taught" }]);
  });
  it("right after a hint is recorded as taught with hintsUsed 1 (never as independent)", async () => {
    const f = fetchOf(ok(ask), ok([{ say: "Hint" }]), ok([{ say: "Yes" }]));
    const b = brain(f), p = emptyProfile(), c = ctx("mars", p);
    await b.respond({ kind: "tap", target: "rock_1" }, c);
    await b.respond(answer("hot"), c);
    await b.respond(answer("rust"), c);
    expect(p.attempts).toMatchObject([{ correct: true, hintsUsed: 1, context: "taught" }]);
  });
  it("a no-hint answer to a skill answered in an EARLIER session is a later_check; in the same session a recheck", async () => {
    const earlier = emptyProfile();
    earlier.attempts.push({ skill: "science.mars.red_color", questionId: "q_red", answerId: "rust", correct: true, hintsUsed: 0, context: "taught", session: 1, at: "x" });
    const f = fetchOf(ok(ask), ok([{ say: "Yes" }]));
    const b = brain(f), c = ctx("mars", earlier, 2);
    await b.respond({ kind: "tap", target: "rock_1" }, c);
    await b.respond(answer("rust"), c);
    expect(earlier.attempts.at(-1)).toMatchObject({ context: "later_check" });

    const same = emptyProfile();
    same.attempts.push({ skill: "science.mars.red_color", questionId: "q_red", answerId: "rust", correct: true, hintsUsed: 0, context: "taught", session: 1, at: "x" });
    const f2 = fetchOf(ok(ask), ok([{ say: "Yes" }]));
    const b2 = brain(f2), c2 = ctx("mars", same, 1);
    await b2.respond({ kind: "tap", target: "rock_1" }, c2);
    await b2.respond(answer("rust"), c2);
    expect(same.attempts.at(-1)).toMatchObject({ context: "recheck" });
  });
  it("a stale or never-asked question is not recorded, and a failed call records nothing", async () => {
    const f = fetchOf(ok([{ say: "ok" }]), ok(ask), new Response("{}", { status: 502 }));
    const b = brain(f), p = emptyProfile(), c = ctx("mars", p);
    await b.respond(answer("rust"), c); // never asked
    expect(p.attempts).toHaveLength(0);
    await b.respond({ kind: "tap", target: "rock_1" }, c);
    await expect(b.respond(answer("rust"), c)).rejects.toBeInstanceOf(BrainUnavailable);
    expect(p.attempts).toHaveLength(0);
  });
  it("the model cannot make an answer count: only ids from the registry are ever recorded", async () => {
    const f = fetchOf(ok(ask), ok([{ say: "Yes!" }]));
    const b = brain(f), p = emptyProfile(), c = ctx("mars", p);
    await b.respond({ kind: "tap", target: "rock_1" }, c);
    await b.respond({ kind: "answer", questionId: "__proto__", optionId: "rust" }, c);
    expect(p.attempts).toHaveLength(0);
  });
});

describe("FallbackBrain and createBrain", () => {
  const scripted = new ScriptedBrain();
  const reply = (say: string): BrainReply => ({ segments: [{ say }] });
  const stub = (impl: () => Promise<BrainReply>) => ({ kind: "model" as const, respond: vi.fn(impl) });

  it("uses the model when it answers", async () => {
    const m = stub(async () => reply("from model"));
    const fb = new FallbackBrain(m, scripted);
    expect((await fb.respond({ kind: "resume" }, ctx())).segments[0].say).toBe("from model");
    expect(fb.kind).toBe("model");
  });
  it("falls back to the script for that turn and says so honestly in kind", async () => {
    const m = stub(async () => { throw new BrainUnavailable("upstream_failed", 502); });
    const fb = new FallbackBrain(m, scripted);
    const r = await fb.respond({ kind: "session_start" }, ctx("classroom"));
    expect(r.segments.length).toBeGreaterThan(0);
    expect(fb.kind).toBe("scripted");
    expect(m.respond).toHaveBeenCalledTimes(1);
  });
  it("a transient failure is retried next turn; a missing key / kill switch / daily cap pauses model calls for 5 minutes", async () => {
    let t = 0;
    const flaky = stub(async () => { throw new BrainUnavailable("upstream_timeout", 504); });
    const fb = new FallbackBrain(flaky, scripted, () => t);
    await fb.respond({ kind: "resume" }, ctx()); await fb.respond({ kind: "resume" }, ctx());
    expect(flaky.respond).toHaveBeenCalledTimes(2);

    const off = stub(async () => { throw new BrainUnavailable("brain_unconfigured", 503); });
    const fb2 = new FallbackBrain(off, scripted, () => t);
    await fb2.respond({ kind: "resume" }, ctx()); await fb2.respond({ kind: "resume" }, ctx());
    expect(off.respond).toHaveBeenCalledTimes(1);
    t += 5 * 60_000 + 1;
    await fb2.respond({ kind: "resume" }, ctx());
    expect(off.respond).toHaveBeenCalledTimes(2);
  });
  it("the scripted brain is the default build; the model brain is opt-in and wrapped in the fallback", () => {
    const old = process.env.NEXT_PUBLIC_BRAIN;
    delete process.env.NEXT_PUBLIC_BRAIN;
    expect(createBrain()).toBeInstanceOf(ScriptedBrain);
    process.env.NEXT_PUBLIC_BRAIN = "model";
    expect(createBrain()).toBeInstanceOf(FallbackBrain);
    process.env.NEXT_PUBLIC_BRAIN = "anything-else";
    expect(createBrain()).toBeInstanceOf(ScriptedBrain);
    if (old === undefined) delete process.env.NEXT_PUBLIC_BRAIN; else process.env.NEXT_PUBLIC_BRAIN = old;
  });
});

describe("ClaudeBrain: one capability check instead of a 503 on every page load", () => {
  const probeOf = (configured: unknown, status = 200) => new Response(JSON.stringify({ configured }), { status });
  const methods = (f: ReturnType<typeof fetchOf>) => f.mock.calls.map((c) => (c[1] as { method: string }).method);
  const pb = (f: ReturnType<typeof fetchOf>) => new ClaudeBrain({ fetchImpl: f as unknown as typeof fetch, probe: true });

  it("not configured: never POSTs, throws brain_unconfigured, and asks only once", async () => {
    resetProbeCache();
    const f = fetchOf(probeOf(false));
    const b = pb(f);
    await expect(b.respond({ kind: "resume" }, ctx())).rejects.toMatchObject({ code: "brain_unconfigured" });
    await expect(b.respond({ kind: "resume" }, ctx())).rejects.toMatchObject({ code: "brain_unconfigured" });
    expect(methods(f)).toEqual(["GET"]);
  });
  it("configured: probes once, then POSTs as usual", async () => {
    resetProbeCache();
    const f = fetchOf(probeOf(true), ok([{ say: "Hi!" }]), ok([{ say: "Again!" }]));
    const b = pb(f);
    await b.respond({ kind: "text", text: "hi" }, ctx("classroom"));
    await b.respond({ kind: "text", text: "hello" }, ctx("classroom"));
    expect(methods(f)).toEqual(["GET", "POST", "POST"]);
  });
  it("cannot tell (404, odd body, offline): the POST still decides, so the 503 fallback keeps working", async () => {
    for (const first of [probeOf(undefined, 404), new Response("nope", { status: 200 }), new TypeError("offline")]) {
      resetProbeCache();
      const f = fetchOf(first, new Response(JSON.stringify({ error: "brain_unconfigured" }), { status: 503 }));
      await expect(pb(f).respond({ kind: "resume" }, ctx())).rejects.toMatchObject({ code: "brain_unconfigured", status: 503 });
      expect(methods(f)).toEqual(["GET", "POST"]);
    }
    resetProbeCache();
  });
  it("probe is off by default (existing callers and tests unchanged)", async () => {
    resetProbeCache();
    const f = fetchOf(ok([{ say: "Hello!" }]));
    await brain(f).respond({ kind: "text", text: "hi" }, ctx("classroom"));
    expect(methods(f)).toEqual(["POST"]);
  });
});
