import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { paymentsMode } from "@/lib/billing/config";
import { checkoutLink, isCheckoutPlan } from "@/lib/billing/links";
import { createServerSupabase } from "@/lib/supabase/server";
import { currentParentId } from "@/lib/auth/parent";
import { recordEvent } from "@/lib/events/record";
import { later } from "@/lib/events/later";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The parent page's checkout button points here (a plain link, no script). We count the click for the signed-in parent
 * (a count only) and send the browser on to the Freemius checkout link from OUR server env. The destination never comes
 * from the request, so this cannot be used as an open redirect. A click that did not start on our own page (cross-site
 * request) is forwarded but not counted, so another site cannot inflate the number.
 */
export async function GET(req: NextRequest) {
  const plan = req.nextUrl.searchParams.get("plan");
  if (paymentsMode() === "off" || !isCheckoutPlan(plan)) return new NextResponse(null, { status: 404 });
  const to = checkoutLink(plan);
  if (!to) return new NextResponse(null, { status: 404 });
  const site = req.headers.get("sec-fetch-site");
  if (site === null || site === "same-origin" || site === "none") {
    try {
      const supabase = await createServerSupabase();
      const id = supabase ? await currentParentId(supabase) : null;
      if (id) later(() => recordEvent("checkout_clicked", { parentId: id })); // after the redirect is sent: a purchase never waits on counting
    } catch { /* counting must never block a purchase */ }
  }
  const res = NextResponse.redirect(to, 303);
  res.headers.set("cache-control", "private, no-store");
  res.headers.set("referrer-policy", "no-referrer");
  return res;
}
