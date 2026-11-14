import "server-only";
/** The only file that talks to Anthropic. The key is passed in, used for one header, and never logged. */
import { LIMITS } from "./config";

export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";

export interface UpstreamResult { content: unknown; usage: { input: number; output: number }; stopReason?: string }
export class UpstreamError extends Error {
  constructor(public kind: "timeout" | "busy" | "failed", public status?: number) { super(kind); }
}

export async function callAnthropic(args: {
  fetchImpl: typeof fetch;
  apiKey: string;
  model: string;
  system: string;
  user: string;
  /** Omit (or pass an empty list) for a call that must not be able to use tools at all. */
  tools?: unknown[];
  /** Reply cap. Defaults to the lesson cap; the anonymous landing taste passes a much smaller one. */
  maxTokens?: number;
}): Promise<UpstreamResult> {
  // One timer covers the request AND reading the response body.
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), LIMITS.upstreamTimeoutMs);
  const aborted = (e: unknown) => e instanceof Error && e.name === "AbortError";
  try {
    let res: Response;
    try {
      res = await args.fetchImpl(ANTHROPIC_URL, {
        method: "POST",
        signal: ctl.signal,
        headers: { "content-type": "application/json", "x-api-key": args.apiKey, "anthropic-version": ANTHROPIC_VERSION },
        body: JSON.stringify({
          model: args.model,
          max_tokens: args.maxTokens ?? LIMITS.maxOutputTokens,
          system: [{ type: "text", text: args.system, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: args.user }],
          ...(args.tools?.length ? { tools: args.tools, tool_choice: { type: "auto" } } : {}),
        }),
      });
    } catch (e) {
      throw new UpstreamError(aborted(e) ? "timeout" : "failed");
    }
    if (res.status === 429 || res.status === 529) throw new UpstreamError("busy", res.status);
    if (!res.ok) throw new UpstreamError("failed", res.status);
    let json: unknown;
    try {
      json = await res.json();
    } catch (e) {
      throw new UpstreamError(aborted(e) ? "timeout" : "failed", res.status);
    }
    const o = json as { content?: unknown; stop_reason?: unknown; usage?: { input_tokens?: unknown; output_tokens?: unknown } };
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
    return { content: o?.content, stopReason: typeof o?.stop_reason === "string" ? o.stop_reason.slice(0, 32) : undefined, usage: { input: n(o?.usage?.input_tokens), output: n(o?.usage?.output_tokens) } };
  } finally {
    clearTimeout(timer);
  }
}
