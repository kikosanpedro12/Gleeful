import { describe, expect, it } from "vitest";
import { ResponseGate, DISCARD_WINDOW_MS } from "@/lib/voice/responseGate";

describe("response gate (late replies to cancelled turns)", () => {
  it("accepts a requested reply", () => {
    const g = new ResponseGate();
    g.expect(0);
    expect(g.onCreated(300)).toBe("accept");
  });
  it("Stop while thinking: the late reply is discarded, the next one is accepted", () => {
    const g = new ResponseGate();
    g.expect(0);
    g.dropPending(200); // child pressed Stop before response.created
    expect(g.onCreated(400)).toBe("discard");
    g.expect(1000);
    expect(g.onCreated(1300)).toBe("accept");
  });
  it("two quick typed inputs: reply to the first is discarded, reply to the second accepted", () => {
    const g = new ResponseGate();
    g.expect(0);
    g.dropPending(100);
    g.expect(100);
    expect(g.onCreated(350)).toBe("discard");
    expect(g.onCreated(600)).toBe("accept");
  });
  it("a request that never produced a reply does not poison later turns (no permanent silence)", () => {
    const g = new ResponseGate();
    g.expect(0); // e.g. turn detector fired but the server created nothing
    g.dropPending(10_000); // much later the child speaks again
    g.expect(11_000);
    expect(g.onCreated(11_400)).toBe("accept");
  });
  it("a discard that is never used up expires", () => {
    const g = new ResponseGate();
    g.expect(0);
    g.dropPending(100);
    g.expect(100 + DISCARD_WINDOW_MS + 500);
    expect(g.onCreated(100 + DISCARD_WINDOW_MS + 900)).toBe("accept");
  });
  it("fails open: an unexpected reply is accepted rather than silencing the teacher", () => {
    expect(new ResponseGate().onCreated(0)).toBe("accept");
  });
  it("tool-only follow-up is accepted", () => {
    const g = new ResponseGate();
    g.expect(0);
    expect(g.onCreated(200)).toBe("accept"); // tool-only reply
    g.expect(900); // follow-up response.create
    expect(g.onCreated(1100)).toBe("accept");
  });
});
