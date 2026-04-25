import { NextRequest, NextResponse } from "next/server";
import { getRecipe } from "@/lib/wire/recipes";
import { getSavedPatchRecipe } from "@/lib/wire/patches-store";
import { runRecipe } from "@/lib/wire/agents";
import { appendRun } from "@/lib/wire/runs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ recipeId: string }> }
) {
  const { recipeId } = await context.params;
  let body: { projectId?: string; userId?: string } = {};
  try { body = await req.json(); } catch {}
  const projectId = body.projectId || process.env.PEEC_PROJECT_ID || "";
  if (!projectId) return NextResponse.json({ ok: false, error: "no project selected" }, { status: 400 });

  const userId = body.userId || "";
  if (!userId) {
    return NextResponse.json({ ok: false, error: "userId required — every Wire run is scoped to a Composio user identity" }, { status: 400 });
  }

  const recipe = getRecipe(recipeId) ?? getSavedPatchRecipe(recipeId, userId);
  if (!recipe) return NextResponse.json({ ok: false, error: "unknown recipe" }, { status: 404 });

  const run = await runRecipe(recipe, projectId, userId);
  appendRun(run);
  return NextResponse.json({ ok: true, run });
}
