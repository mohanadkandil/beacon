import { NextRequest, NextResponse } from "next/server";
import { listConnectedToolkits } from "@/lib/wire/composio";

export const dynamic = "force-dynamic";

/**
 * GET /api/wire/composio/connections?userId=...
 * Returns { connections: string[] } — the toolkit slugs this user has linked.
 */
export async function GET(req: NextRequest) {
  if (!process.env.COMPOSIO_API_KEY) {
    return NextResponse.json({ ok: false, error: "COMPOSIO_API_KEY not set" }, { status: 500 });
  }
  const userId = req.nextUrl.searchParams.get("userId") || "";
  if (!userId) return NextResponse.json({ ok: false, error: "userId required" }, { status: 400 });
  const connections = await listConnectedToolkits(userId);
  return NextResponse.json({ ok: true, userId, connections });
}
