import { NextRequest, NextResponse } from "next/server";
import { initiateConnection } from "@/lib/wire/composio";

export const dynamic = "force-dynamic";

/**
 * POST /api/wire/composio/connect
 * Body: { toolkit: string, userId: string }
 *
 * Returns { redirectUrl } the client opens in a new tab to authorize.
 */
export async function POST(req: NextRequest) {
  if (!process.env.COMPOSIO_API_KEY) {
    return NextResponse.json({ ok: false, error: "COMPOSIO_API_KEY not set" }, { status: 500 });
  }
  let body: { toolkit?: string; userId?: string } = {};
  try { body = await req.json(); } catch {}
  const { toolkit, userId } = body;
  if (!toolkit || !userId) return NextResponse.json({ ok: false, error: "missing toolkit or userId" }, { status: 400 });

  const result = await initiateConnection(toolkit, userId);
  if (!result.redirectUrl) {
    return NextResponse.json({ ok: false, error: result.error || "Composio returned no redirect URL" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, redirectUrl: result.redirectUrl });
}
