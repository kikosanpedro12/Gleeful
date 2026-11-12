import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocalLearnerStore } from "@/lib/learner/store";

const mem = new Map<string, string>();
beforeEach(() => {
  mem.clear();
  vi.stubGlobal("localStorage", { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
});
const KEY = "aiteacher.learner.v1";
const ok = { skill: "s", questionId: "q", answerId: "a", correct: true, hintsUsed: 0, context: "taught" as const };

describe("local learner store", () => {
  it("counts sessions and stamps attempts with the session number", async () => {
    const s = new LocalLearnerStore();
    await s.startSession("leo");
    await s.recordAttempt(ok);
    const p2 = await s.startSession("mia");
    expect(p2.sessions).toBe(2);
    expect(p2.teacher).toBe("mia");
    expect(p2.attempts[0]).toMatchObject({ ...ok, session: 1 });
  });
  it("survives corrupted or tampered storage without breaking the lesson", async () => {
    const s = new LocalLearnerStore();
    for (const junk of ["{", "null", "[]", '{"version":2}', '{"version":1,"attempts":"x"}'] ) {
      mem.set(KEY, junk);
      expect((await s.load()).attempts).toEqual([]);
    }
    mem.set(KEY, JSON.stringify({ version: 1, learnerId: 5, teacher: "<script>", sessions: -3, attempts: [
      ok, { ...ok, context: "mastered" }, { ...ok, hintsUsed: -1 }, { ...ok, correct: "yes" }, null, "x",
    ] }));
    const p = await s.load();
    expect(p.attempts).toEqual([ok]);
    expect(p.teacher).toBeNull();
    expect(p.sessions).toBe(0);
    expect(p.learnerId).toBe("demo-child");
  });
  it("keeps a bounded history (no unbounded growth)", async () => {
    const s = new LocalLearnerStore();
    for (let i = 0; i < 520; i++) await s.recordAttempt(ok);
    expect((await s.load()).attempts.length).toBe(500);
  });
  it("blocked storage (private mode) never throws into the lesson", async () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } });
    const s = new LocalLearnerStore();
    await expect(s.startSession("leo")).resolves.toMatchObject({ sessions: 1 });
    await expect(s.recordAttempt(ok)).resolves.toBeUndefined();
    await expect(s.deleteAll()).resolves.toBeUndefined();
  });
  it("deleteAll wipes the history", async () => {
    const s = new LocalLearnerStore();
    await s.recordAttempt(ok);
    await s.deleteAll();
    expect((await s.load()).attempts).toEqual([]);
  });
});
