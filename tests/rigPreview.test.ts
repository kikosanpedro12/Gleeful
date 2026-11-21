import { describe, expect, it } from "vitest";
import { glbEnabled, parseRigParam, resolveRigPreview, RIG_STORAGE_KEY, type RigStore } from "@/lib/teacher/glbFlag";
import { perfEnabled, RollingFps } from "@/lib/telemetry/perfOverlay";

const mem = (init: Record<string, string> = {}): RigStore & { data: Record<string, string> } => {
  const data = { ...init };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v; }, removeItem: (k) => { delete data[k]; } };
};
const throwing: RigStore = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };

describe("rig param allow-list", () => {
  it("accepts exactly the two vetted rigs", () => {
    expect(parseRigParam("?rig=glb")).toBe("glb");
    expect(parseRigParam("?a=1&rig=procedural&b=2")).toBe("procedural");
  });
  it("ignores everything else", () => {
    for (const s of ["", "?", "?rig=", "?rig=GLB", "?rig=glb ", "?rig=glb,procedural", "?rig=glb;x", "?rig=__proto__", "?rig=constructor", "?rig=../../x.glb", "?rig=http://evil/x.glb", "?rig=<script>", "?rig[]=glb", "?Rig=glb", "?rig=glb%00", "?rig=%ZZ", "rig=glb2", "?xrig=glb"]) {
      expect(parseRigParam(s), s).toBeNull();
    }
    expect(parseRigParam(undefined)).toBeNull();
    expect(parseRigParam(null)).toBeNull();
    expect(parseRigParam(42 as unknown as string)).toBeNull();
  });
  it("first value wins when repeated", () => {
    expect(parseRigParam("?rig=procedural&rig=glb")).toBe("procedural");
  });
  it("never returns anything but the allow-listed words", () => {
    for (const s of ["?rig=%67lb", "?rig=glb&rig=x", "?rig=procedural"]) expect([null, "glb", "procedural"]).toContain(parseRigParam(s));
  });
});

describe("sticky session choice (procedural escape hatch)", () => {
  it("?rig=procedural is remembered and used on the next page without the param", () => {
    const st = mem();
    expect(resolveRigPreview("?rig=procedural", st)).toBe("procedural");
    expect(st.data[RIG_STORAGE_KEY]).toBe("procedural");
    expect(resolveRigPreview("", st)).toBe("procedural");
    expect(glbEnabled({ search: "", store: st })).toBe(false);
  });
  it("?rig=glb clears it, for this view and after", () => {
    const st = mem({ [RIG_STORAGE_KEY]: "procedural" });
    expect(resolveRigPreview("?rig=glb", st)).toBe("glb");
    expect(RIG_STORAGE_KEY in st.data).toBe(false);
    expect(resolveRigPreview("", st)).toBeNull();
    expect(glbEnabled({ search: "?rig=glb", store: mem({ [RIG_STORAGE_KEY]: "procedural" }) })).toBe(true);
  });
  it("hostile stored values and hostile params are not believed or stored", () => {
    for (const v of ["PROCEDURAL", "1", "true", "glb", "__proto__", "procedural "]) expect(resolveRigPreview("", mem({ [RIG_STORAGE_KEY]: v })), v).toBeNull();
    const st = mem();
    expect(resolveRigPreview("?rig=evil", st)).toBeNull();
    expect(st.data).toEqual({});
  });
  it("storage that throws or is missing falls back to the URL alone", () => {
    expect(resolveRigPreview("?rig=glb", throwing)).toBe("glb");
    expect(resolveRigPreview("?rig=procedural", throwing)).toBe("procedural");
    expect(resolveRigPreview("", throwing)).toBeNull();
    expect(resolveRigPreview("?rig=procedural", null)).toBe("procedural");
    expect(resolveRigPreview("", null)).toBeNull();
  });
  it("default is GLB ON; only NEXT_PUBLIC_CHAR_GLB=0 (kill switch) or the escape hatch turn it off", () => {
    expect(glbEnabled({ search: "", build: undefined, store: mem() })).toBe(true);
    expect(glbEnabled({ search: "?perf=1", store: mem() })).toBe(true);
    expect(glbEnabled({ search: "?test=1", store: mem() })).toBe(true);
    expect(glbEnabled({ build: "0", search: "", store: mem() })).toBe(false);
    expect(glbEnabled({ build: "1", search: "", store: mem() })).toBe(true);
    for (const v of ["false", "off", "OFF", " 0 "]) expect(glbEnabled({ build: v, search: "", store: mem() }), v).toBe(false);
    expect(glbEnabled({ build: "1", search: "?rig=procedural", store: mem() })).toBe(false);
  });
});

describe("perf overlay switch and maths", () => {
  it("is off unless the query is exactly perf=1", () => {
    expect(perfEnabled("?perf=1")).toBe(true);
    expect(perfEnabled("?rig=glb&perf=1")).toBe(true);
    for (const s of ["", "?perf", "?perf=", "?perf=0", "?perf=true", "?perf=11", "?PERF=1", "?xperf=1", undefined, null]) expect(perfEnabled(s as string), String(s)).toBe(false);
  });
  it("rolling average fps over ~2 s", () => {
    const m = new RollingFps(2000);
    expect(m.fps()).toBe(0);
    for (let i = 0; i < 200; i++) m.push(1000 / 60);
    expect(m.fps()).toBeCloseTo(60, 0);
    // the old fast frames age out once 2 s of slow frames have arrived
    for (let i = 0; i < 100; i++) m.push(50);
    expect(m.fps()).toBeCloseTo(20, 0);
  });
  it("keeps only about 2 s and handles odd input", () => {
    const m = new RollingFps(2000);
    for (let i = 0; i < 1000; i++) m.push(10);
    expect(m.fps()).toBeCloseTo(100, 0);
    m.push(NaN); m.push(-5); m.push(0); m.push(Infinity); m.push(60000); // ignored
    expect(m.fps()).toBeCloseTo(100, 0);
    const one = new RollingFps(2000);
    one.push(4000); // a single long frame is still counted: 0.25 fps
    expect(one.fps()).toBeCloseTo(0.25, 2);
    one.reset();
    expect(one.fps()).toBe(0);
  });
});
