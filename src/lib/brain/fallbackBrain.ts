import type { Brain, BrainContext, BrainInput, BrainReply } from "./types";

/** Codes that will not fix themselves in seconds: stop asking the server for a while. */
const SKIP_CODES = new Set(["brain_disabled", "brain_unconfigured", "daily_limit", "global_limit", "forbidden_origin", "bad_request"]);
const SKIP_MS = 5 * 60_000;

/**
 * Model first, script when the model cannot answer. The lesson never dies
 * because a network call failed. `kind` tells the truth about the LAST turn.
 */
export class FallbackBrain implements Brain {
  private last: Brain["kind"] = "model";
  private skipUntil = 0;
  constructor(private primary: Brain, private fallback: Brain, private now: () => number = () => Date.now()) {}

  get kind(): Brain["kind"] { return this.last; }

  async respond(input: BrainInput, ctx: BrainContext): Promise<BrainReply> {
    if (this.now() >= this.skipUntil) {
      try {
        const r = await this.primary.respond(input, ctx);
        this.last = this.primary.kind;
        return r;
      } catch (e) {
        const code = (e as { code?: unknown } | null)?.code;
        if (typeof code === "string" && SKIP_CODES.has(code)) this.skipUntil = this.now() + SKIP_MS;
      }
    }
    this.last = this.fallback.kind;
    return this.fallback.respond(input, ctx);
  }
}
