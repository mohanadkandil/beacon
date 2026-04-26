import { NextResponse } from "next/server";
import { RECIPES } from "@/lib/wire/recipes";
import { runRecipe } from "@/lib/wire/agents";
import { appendRun } from "@/lib/wire/runs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Scheduled execution. v0 fires all live recipes for the system user once.
 * Phase 2 honors per-user enabled flags + per-recipe schedules + Postgres state.
 *
 * For multi-tenant cron, set COMPOSIO_SYSTEM_USER_ID and PEEC_PROJECT_ID to a
 * baseline configuration, then loop per-user when persistence is added.
 */
export async function GET() {
  const projectId = process.env.PEEC_PROJECT_ID || "";
  const userId = process.env.COMPOSIO_SYSTEM_USER_ID || "";
  if (!projectId) return NextResponse.json({ ok: false, error: "PEEC_PROJECT_ID not set for cron" }, { status: 400 });
  if (!userId) return NextResponse.json({ ok: false, error: "COMPOSIO_SYSTEM_USER_ID not set — cron needs a Composio identity to run as" }, { status: 400 });

  const liveRecipes = RECIPES.filter((r) => r.status === "live");
  const results = [];
  for (const recipe of liveRecipes) {
    const run = await runRecipe(recipe, projectId, userId);
    await appendRun(run, process.env.COMPOSIO_USER_ID || "system");
    results.push({ recipe: recipe.id, status: run.status, message: run.message });
  }
  return NextResponse.json({ ok: true, results });
}
