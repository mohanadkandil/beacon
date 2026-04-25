import { NextRequest, NextResponse } from "next/server";
import { getSavedPatch, upsertSavedPatch, deleteSavedPatch, isUserPatchId } from "@/lib/wire/patches-store";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isUserPatchId(id)) return NextResponse.json({ ok: false, error: "not a user patch id" }, { status: 400 });
  const p = await getSavedPatch(id);
  if (!p) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, patch: p });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isUserPatchId(id)) return NextResponse.json({ ok: false, error: "patch id must start with 'p_'" }, { status: 400 });
  let body: { name?: string; userId?: string; nodes?: unknown[]; edges?: unknown[] } = {};
  try { body = await req.json(); } catch {}
  const { name, userId, nodes, edges } = body;
  if (!name || !userId || !Array.isArray(nodes) || !Array.isArray(edges)) {
    return NextResponse.json({ ok: false, error: "name, userId, nodes, edges required" }, { status: 400 });
  }
  const p = await upsertSavedPatch({
    id, name, ownerId: userId,
    nodes: nodes as never,
    edges: edges as never,
  });
  return NextResponse.json({ ok: true, patch: p });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const userId = req.nextUrl.searchParams.get("userId") || "";
  if (!userId) return NextResponse.json({ ok: false, error: "userId required" }, { status: 400 });
  const ok = await deleteSavedPatch(id, userId);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}
