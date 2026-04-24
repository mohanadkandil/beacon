import { NextRequest, NextResponse } from "next/server";
import { getAllUserConfig, setUserConfig } from "@/lib/wire/user-config-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId") || "";
  if (!userId) return NextResponse.json({ ok: false, error: "userId required" }, { status: 400 });
  const config = await getAllUserConfig(userId);
  return NextResponse.json({ ok: true, config });
}

export async function POST(req: NextRequest) {
  let body: { userId?: string; key?: string; value?: string } = {};
  try { body = await req.json(); } catch {}
  const { userId, key, value } = body;
  if (!userId || !key || value === undefined) {
    return NextResponse.json({ ok: false, error: "userId, key, value required" }, { status: 400 });
  }
  await setUserConfig(userId, key, value);
  return NextResponse.json({ ok: true, userId, key, value });
}
