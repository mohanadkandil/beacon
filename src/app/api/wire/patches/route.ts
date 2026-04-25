import { NextRequest, NextResponse } from "next/server";
import { listUserPatches } from "@/lib/wire/patches-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId") || "";
  if (!userId) return NextResponse.json({ ok: false, error: "userId required" }, { status: 400 });
  return NextResponse.json({ ok: true, patches: await listUserPatches(userId) });
}
