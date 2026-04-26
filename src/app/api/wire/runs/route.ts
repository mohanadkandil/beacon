import { getRuns } from "@/lib/wire/runs";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId") || "system";
  const runs = await getRuns(userId);
  return NextResponse.json({ ok: true, runs });
}
