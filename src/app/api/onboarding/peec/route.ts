import { NextRequest, NextResponse } from "next/server";
import {
  PROJECT_SCOPED_ID,
  listBrands,
  listModels,
  listProjects,
  listTopics,
  type Project,
} from "@/lib/peec-rest";
import { setUserConfig, CONFIG_KEYS } from "@/lib/wire/user-config-store";

export const dynamic = "force-dynamic";

/**
 * POST /api/onboarding/peec
 * Body: { userId, action: "validate" | "save", apiKey, projectId?, projectName? }
 *
 * - "validate" — pings Peec /projects with the user-supplied key and returns
 *   the list. Does NOT save anything yet so a wrong key never gets persisted.
 * - "save" — writes apiKey + projectId (+ optional projectName) to the user's
 *   per-user config. Used after the user picks one of the validated projects.
 */
export async function POST(req: NextRequest) {
  let body: { userId?: string; action?: string; apiKey?: string; projectId?: string; projectName?: string } = {};
  try { body = await req.json(); } catch {}
  const { userId, action, apiKey, projectId, projectName } = body;
  if (!userId) return NextResponse.json({ ok: false, error: "userId required" }, { status: 400 });

  if (action === "demo") {
    const demoKey = process.env.PEEC_API_KEY;
    const demoProjectId = process.env.PEEC_PROJECT_ID;
    if (!demoKey || !demoProjectId) {
      return NextResponse.json({ ok: false, error: "Demo Peec project is not configured." }, { status: 500 });
    }
    try {
      const [brands, topics, models] = await Promise.all([
        listBrands(demoProjectId, demoKey),
        listTopics(demoProjectId, demoKey),
        listModels(demoProjectId, demoKey),
      ]);
      const own = brands.find((b) => b.is_own) ?? brands[0];
      const name = own?.name ? `${own.name} demo` : "Demo project";
      await setUserConfig(userId, CONFIG_KEYS.peec.mode, "demo");
      await setUserConfig(userId, CONFIG_KEYS.peec.apiKey, "");
      await setUserConfig(userId, CONFIG_KEYS.peec.projectId, demoProjectId);
      await setUserConfig(userId, CONFIG_KEYS.peec.projectName, name);
      return NextResponse.json({
        ok: true,
        project: { id: demoProjectId, name },
        summary: {
          brands: brands.length,
          topics: topics.length,
          activeModels: models.filter((m) => m.is_active).length,
        },
      });
    } catch (err) {
      return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
    }
  }

  if (!apiKey || apiKey.length < 10) return NextResponse.json({ ok: false, error: "apiKey required" }, { status: 400 });

  if (action === "validate") {
    try {
      const projects: Project[] = await listProjects(apiKey);
      if (projects.length) return NextResponse.json({ ok: true, projects });
    } catch (err) {
      if (!/Not a Company API Key/i.test((err as Error).message)) {
        return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 200 });
      }
    }

    try {
      const brands = await listBrands(undefined, apiKey);
      const own = brands.find((b) => b.is_own) ?? brands[0];
      return NextResponse.json({
        ok: true,
        projectScoped: true,
        projects: [{
          id: PROJECT_SCOPED_ID,
          name: own?.name ? `${own.name} project` : "Project-scoped Peec key",
          status: "PROJECT",
        }],
      });
    } catch (err) {
      return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 200 });
    }
  }

  if (action === "save") {
    if (!projectId) return NextResponse.json({ ok: false, error: "projectId required to save" }, { status: 400 });
    try {
      const [brands, topics, models] = await Promise.all([
        listBrands(projectId, apiKey),
        listTopics(projectId, apiKey),
        listModels(projectId, apiKey),
      ]);
      await setUserConfig(userId, CONFIG_KEYS.peec.mode, "custom");
      await setUserConfig(userId, CONFIG_KEYS.peec.apiKey, apiKey);
      await setUserConfig(userId, CONFIG_KEYS.peec.projectId, projectId);
      if (projectName) await setUserConfig(userId, CONFIG_KEYS.peec.projectName, projectName);
      return NextResponse.json({
        ok: true,
        summary: {
          brands: brands.length,
          topics: topics.length,
          activeModels: models.filter((m) => m.is_active).length,
        },
      });
    } catch (err) {
      return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
}
