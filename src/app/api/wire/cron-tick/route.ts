import { NextRequest, NextResponse } from "next/server";
import { tick } from "@/lib/wire/scheduler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Tick endpoint — fires all due scheduled patches.
 *
 * Triggered by:
 *   - Browser poll (every 30s while Wire is open) — for dev / demo
 *   - Cloudflare Worker cron (cloudflare/) — production every minute
 *   - Vercel Cron (vercel.json) — alternative production
 *
 * Optional auth: if YAPPR_CRON_SECRET is set on the yappr side, requests
 * must send a matching `X-Yappr-Cron-Secret`, legacy
 * `X-Beacon-Cron-Secret`, or `Authorization: Bearer ...` header. Browser
 * polls don't carry the header — they're treated as "open" until you decide
 * to lock down.
 *
 * Recommended pattern:
 *   - Set YAPPR_CRON_SECRET only after deploying the Worker
 *   - Worker sends the header automatically (configured in wrangler.toml)
 *   - Browser polls keep working in dev (no env var set locally)
 */
export async function POST(req: NextRequest) { return run(req); }
export async function GET(req: NextRequest)  { return run(req); }

async function run(req: NextRequest) {
  if (req.nextUrl.searchParams.get("health") === "1") {
    return NextResponse.json({
      ok: true,
      endpoint: "/api/wire/cron-tick",
      authRequired: !!(process.env.YAPPR_CRON_SECRET || process.env.BEACON_CRON_SECRET),
      accepts: ["X-Yappr-Cron-Secret", "X-Beacon-Cron-Secret", "Authorization: Bearer"],
    });
  }

  const required = process.env.YAPPR_CRON_SECRET || process.env.BEACON_CRON_SECRET;
  if (required) {
    const headerSecret = req.headers.get("x-yappr-cron-secret") ?? req.headers.get("x-beacon-cron-secret");
    const bearerSecret = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (headerSecret !== required && bearerSecret !== required) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }
  const result = await tick();
  return NextResponse.json({ ok: true, ...result, ts: Date.now() });
}
