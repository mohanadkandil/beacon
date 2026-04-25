import { NextRequest, NextResponse } from "next/server";
import { getSchedules, setSchedule, presetLabel, nextFiringAt, type SchedulePreset } from "@/lib/wire/scheduler";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId") || "";
  if (!userId) return NextResponse.json({ ok: false, error: "userId required" }, { status: 400 });
  const schedules = getSchedules(userId).map((s) => ({
    patchId: s.patchId,
    preset: s.preset,
    presetLabel: presetLabel(s.preset),
    lastRunAt: s.lastRunAt,
    nextFiringAt: nextFiringAt(s),
  }));
  return NextResponse.json({ ok: true, schedules });
}

export async function POST(req: NextRequest) {
  let body: { userId?: string; patchId?: string; preset?: SchedulePreset; projectId?: string } = {};
  try { body = await req.json(); } catch {}
  const { userId, patchId, preset, projectId } = body;
  if (!userId || !patchId || !preset || !projectId) {
    return NextResponse.json({ ok: false, error: "userId, patchId, preset, projectId all required" }, { status: 400 });
  }
  const s = setSchedule({ userId, patchId, preset, projectId });
  return NextResponse.json({
    ok: true,
    schedule: { patchId: s.patchId, preset: s.preset, presetLabel: presetLabel(s.preset), nextFiringAt: nextFiringAt(s) },
  });
}
