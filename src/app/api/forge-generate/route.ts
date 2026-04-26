import { NextRequest, NextResponse } from "next/server";
import { listBrands, getURLReport } from "@/lib/peec-rest";
import { CONFIG_KEYS, getUserConfig } from "@/lib/wire/user-config-store";

export const dynamic = "force-dynamic";

/**
 * POST /api/forge-generate
 * Body: { topic: string, projectId?: string, competitorNames?: string[], tone?: string }
 *
 * Generates a full article draft grounded in the project's Peec data:
 *   - tracked competitor names for honest mention
 *   - top cited URLs in matching topics for JTBD anchoring
 *
 * Returns { html, rationale, model }.
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
  if (!apiKey) return NextResponse.json({ ok: false, error: "OPENROUTER_API_KEY not set" }, { status: 500 });

  let body: { topic?: string; projectId?: string; competitorNames?: string[]; tone?: string; userId?: string } = {};
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }

  const topic = (body.topic || "").trim();
  if (!topic) return NextResponse.json({ ok: false, error: "topic is required" }, { status: 400 });

  const projectId = body.projectId || process.env.PEEC_PROJECT_ID;
  const peecApiKey = body.userId
    ? await getUserConfig(body.userId, CONFIG_KEYS.peec.apiKey, "PEEC_API_KEY")
    : process.env.PEEC_API_KEY;
  const tone = body.tone || "editorial, confident, specific";

  // Pull a small slice of Peec context for grounding.
  let competitorNames: string[] = body.competitorNames ?? [];
  let citedTitles: string[] = [];
  let ownBrandName: string | undefined;
  if (projectId) {
    try {
      const [brands, urls] = await Promise.all([
        listBrands(projectId, peecApiKey),
        getURLReport({
          projectId,
          startDate: new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10),
          endDate: new Date().toISOString().slice(0, 10),
          limit: 30,
          apiKey: peecApiKey,
        }),
      ]);
      ownBrandName = brands.find((b) => b.is_own)?.name;
      if (!competitorNames.length) {
        competitorNames = brands.filter((b) => !b.is_own).map((b) => b.name).filter(Boolean);
      }
      citedTitles = urls.map((u) => u.title).filter((t): t is string => !!t).slice(0, 8);
    } catch {
      // non-fatal; just generate with less grounding
    }
  }

  const userPrompt = `Generate a complete article draft on the topic: "${topic}"

CONTEXT:
- Own brand: ${ownBrandName ?? "(unknown)"}
- Tracked competitors: ${competitorNames.slice(0, 6).join(", ") || "(none)"}
- Top cited URL titles in the space (for JTBD framing reference):
${citedTitles.map((t) => `  · ${t}`).join("\n") || "  (none)"}

TONE: ${tone}

CONSTRAINTS:
- Output a complete article in HTML using <h1>, <h2>, <p>, <em>, <strong> only.
- Single H1 (the article title) anchored in JTBD terms from the cited titles.
- 2-4 H2 sections.
- 2-3 paragraphs per section.
- Mention ${ownBrandName ?? "the own brand"} naturally in 1-2 places, never in a fake-superlative way.
- If competitors are tracked, name 1-2 of them concretely with a real distinction the reader would believe.
- Don't fabricate stats, prices, or claims you can't ground.

Return JSON with two fields:
- html: the article HTML
- rationale: one sentence on how this draft uses the Peec context`;

  const reqBody = {
    model,
    messages: [
      { role: "system", content: "You are Forge, yappr's article generator. You produce GEO-optimized drafts grounded in real Peec citation data. No fabrication." },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.5,
    max_tokens: 1800,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "forge_article",
        strict: true,
        schema: {
          type: "object",
          properties: {
            html: { type: "string", description: "Full article HTML" },
            rationale: { type: "string", description: "One sentence on how Peec data shaped the draft" },
          },
          required: ["html", "rationale"],
          additionalProperties: false,
        },
      },
    },
  };

  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://yappr.ai",
        "X-Title": "yappr Forge",
      },
      body: JSON.stringify(reqBody),
    });
    if (!r.ok) {
      const errText = await r.text();
      return NextResponse.json({ ok: false, error: `OpenRouter ${r.status}: ${errText.slice(0, 400)}` }, { status: 500 });
    }
    const data = await r.json();
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return NextResponse.json({ ok: false, error: "OpenRouter returned no content" }, { status: 500 });
    const parsed = JSON.parse(raw);
    return NextResponse.json({
      ok: true,
      html: parsed.html,
      rationale: parsed.rationale,
      model,
      groundedIn: { competitors: competitorNames.slice(0, 6), citedTitles },
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
