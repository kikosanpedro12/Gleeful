/**
 * Decides whether a `response.created` from the voice service belongs to
 * something we are still waiting for, or is a late reply to a turn the child
 * already cancelled (Stop / new input before the reply was created).
 *
 * Pure and time-injected so it can be unit tested. Deliberately fails OPEN:
 * if bookkeeping is ever wrong, a reply is accepted (the session controller
 * has a second, state-based check) rather than the teacher going silent.
 */
export const DISCARD_WINDOW_MS = 2500;
const STALE_REQUEST_MS = 2500;

export class ResponseGate {
  private pending: number[] = [];
  private discards = 0;
  private discardAt = 0;

  /** A reply has been requested (response.create sent, or the turn detector ended a turn). */
  expect(now: number) {
    this.pending.push(now);
  }

  /** Everything requested so far is unwanted. Only recent requests can still produce a reply. */
  dropPending(now: number) {
    const recent = this.pending.filter((t) => now - t < STALE_REQUEST_MS).length;
    this.pending = [];
    if (recent) {
      this.discards += recent;
      this.discardAt = now;
    }
  }

  onCreated(now: number): "accept" | "discard" {
    if (this.discards > 0 && now - this.discardAt <= DISCARD_WINDOW_MS) {
      this.discards--;
      return "discard";
    }
    this.discards = 0;
    this.pending.shift();
    return "accept";
  }

  reset() {
    this.pending = [];
    this.discards = 0;
  }
}
