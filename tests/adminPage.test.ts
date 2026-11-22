import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

describe("admin page render (guard mocked as admin)", () => {
  it("shows honest panels, booleans only, and no secret values", async () => {
    vi.resetModules();
    process.env.ANTHROPIC_API_KEY = "x".repeat(8) + "-SECRET-A";
    process.env.ELEVENLABS_API_KEY = "x".repeat(8) + "-SECRET-E";
    vi.doMock("@/lib/admin/guard", () => ({ requireAdmin: async () => {} }));
    const { recordEvent } = await import("@/lib/admin/events");
    recordEvent("taste", "upstream_error");
    const { default: Page } = await import("@/app/admin/page");
    const html = renderToStaticMarkup(await Page());
    for (const t of ["panel-switches", "panel-voice", "panel-events", "panel-not-tracked", "5,000", "taste.upstream_error", "Sign-ups (parent accounts): not tracked yet", "key is set"]) expect(html, t).toContain(t);
    expect(html).not.toContain("SECRET");
    expect(html).not.toMatch(/<form|<button|<input/); // read-only: nothing to submit
    delete process.env.ANTHROPIC_API_KEY; delete process.env.ELEVENLABS_API_KEY;
  });
  it("a non-admin never reaches the render (guard throws)", async () => {
    vi.resetModules();
    vi.doMock("@/lib/admin/guard", () => ({ requireAdmin: async () => { throw new Error("NEXT_NOT_FOUND"); } }));
    const { default: Page } = await import("@/app/admin/page");
    await expect(Page()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
