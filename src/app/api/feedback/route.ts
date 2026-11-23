import "server-only";
import { handleFeedback, makeFeedbackLimiter } from "@/lib/feedback/handler";
import { feedbackConfigured, saveFeedback } from "@/lib/feedback/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const limiter = makeFeedbackLimiter();
export async function POST(req: Request) {
  return handleFeedback(req, { configured: feedbackConfigured, save: saveFeedback, limiter, now: () => Date.now() });
}
