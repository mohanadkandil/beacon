import { NextRequest, NextResponse } from "next/server";
import { PROJECT_SCOPED_ID, listBrands, listProjects, type Project } from "@/lib/peec-rest";
import { getUserConfig, CONFIG_KEYS } from "@/lib/wire/user-config-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId") || "";
  try {
    const apiKey = userId
      ? await getUserConfig(userId, CONFIG_KEYS.peec.apiKey, "PEEC_API_KEY")
      : (process.env.PEEC_API_KEY || undefined);
    let projects: Project[];
    try {
      projects = await listProjects(apiKey);
    } catch (err) {
      if (!/Not a Company API Key/i.test((err as Error).message)) throw err;
      const brands = await listBrands(undefined, apiKey);
      const own = brands.find((b) => b.is_own) ?? brands[0];
      projects = [{
        id: PROJECT_SCOPED_ID,
        name: own?.name ? `${own.name} project` : "Project-scoped Peec key",
        status: "PROJECT",
      }];
    }
    return NextResponse.json({ ok: true, projects });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
