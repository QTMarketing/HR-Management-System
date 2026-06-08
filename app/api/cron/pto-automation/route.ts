import { NextResponse } from "next/server";
import { executeDuePtoAutomationJobs } from "@/app/actions/pto-automation";

/**
 * Daily PTO automation hook — call from Vercel Cron or external scheduler.
 *
 * GET /api/cron/pto-automation
 * Header: Authorization: Bearer <CRON_SECRET>
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not configured." }, { status: 503 });
  }

  const auth = request.headers.get("authorization")?.trim() ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const headerKey = request.headers.get("x-cron-secret")?.trim() ?? "";

  if (bearer !== secret && headerKey !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const results = await executeDuePtoAutomationJobs("cron");
  return NextResponse.json({ ok: true, results });
}
