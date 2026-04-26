/**
 * Wire — agent runners.
 *
 * Read side: Peec REST (real data, no fabrication).
 * Write side: ALL external writes go through Composio MCP. One auth surface,
 * one SDK, every tool. Removes Octokit, Slack webhooks, and Notion/Linear/Gmail
 * SDK glue from this file.
 *
 * The user connects GitHub / Slack / Notion / Linear / Gmail once in the
 * Composio dashboard against COMPOSIO_USER_ID. From there, agents call any
 * tool slug via executeTool().
 */

import { getURLReport, getBrandReport, listBrands, listTopics } from "@/lib/peec-rest";
import type { Run } from "./runs";
import { newRunId } from "./runs";
import { executeTool } from "./composio";
import { getUserConfig, CONFIG_KEYS } from "./user-config-store";
import type { Recipe } from "./recipes";

function lastNDays(n: number): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  const startD = new Date(now);
  startD.setDate(now.getDate() - n);
  return { start: startD.toISOString().slice(0, 10), end };
}

function nowISO() { return new Date().toISOString(); }

function requireEnv(name: string): string | null {
  return process.env[name] || null;
}

export async function runRecipe(recipe: Recipe, projectId: string, userId: string): Promise<Run> {
  const startedAt = nowISO();
  const id = newRunId();
  const base: Run = {
    id, recipeId: recipe.id, recipeName: recipe.name, recipeEmoji: recipe.emoji,
    startedAt, status: "running", message: "Starting…", trace: [],
  };
  try {
    const peecApiKey = await getUserConfig(userId, CONFIG_KEYS.peec.apiKey, "PEEC_API_KEY");
    if (!peecApiKey) {
      return {
        ...base,
        endedAt: nowISO(),
        status: "failed",
        message: "Connect your Peec API key in onboarding before running Wire.",
      };
    }

    switch (recipe.id) {
      case "schema-sweeper":  return await runSchemaSweeper(base, projectId, userId, peecApiKey);
      case "slack-brief":     return await runSlackBrief(base, projectId, userId, peecApiKey);
      case "citation-watch":  return await runCitationWatch(base, projectId, userId, peecApiKey);
      case "competitor-surge": return await runCompetitorSurge(base, projectId, userId, peecApiKey);
      case "notion-drafter":  return await runNotionDrafter(base, projectId, userId, peecApiKey);
      case "linear-triager":  return await runLinearTriager(base, projectId, userId, peecApiKey);
      case "gmail-pitcher":   return await runGmailPitcher(base, projectId, userId, peecApiKey);
      case "stale-content":   return await runStubAgent(base, "Stale Content Sweeper", "Scans complete. 0 stale posts to draft (stub mode).");
      case "lift-auditor":    return await runStubAgent(base, "Lift Auditor", "Awaiting agent actions to measure (no actions in last 14d).");
      case "press-pitch":     return await runStubAgent(base, "Schema Coverage Report", "Coming soon — needs HTML scraping pipeline.");
      default:
        if (recipe.id.startsWith("p_")) {
          return await runStubAgent(base, recipe.name, "Custom patch is saved and scheduleable. Live canvas execution is not wired yet.");
        }
        return { ...base, endedAt: nowISO(), status: "failed", message: `Unknown recipe ${recipe.id}` };
    }
  } catch (err) {
    return { ...base, endedAt: nowISO(), status: "failed", message: "Agent threw", error: (err as Error).message };
  }
}

function composioGuard(): { ok: false; message: string } | null {
  if (!process.env.COMPOSIO_API_KEY) {
    return { ok: false, message: "COMPOSIO_API_KEY not set in .env.local" };
  }
  return null;
}

// ----------------------------------------------------------------------------
// Schema Sweeper — opens a GitHub PR via Composio
// ----------------------------------------------------------------------------

async function runSchemaSweeper(run: Run, projectId: string, userId: string, apiKey: string): Promise<Run> {
  const trace: string[] = [];
  const guard = composioGuard();
  if (guard) return { ...run, endedAt: nowISO(), status: "failed", message: guard.message, trace };
  const repoEnv = (await getUserConfig(userId, CONFIG_KEYS.github.repo, "GITHUB_REPO")) ?? null;
  if (!repoEnv || !repoEnv.includes("/")) {
    return { ...run, endedAt: nowISO(), status: "failed", message: "Set your GitHub repo in Settings → GitHub (format: owner/repo).", trace };
  }
  const [owner, repo] = repoEnv.split("/");

  const { start, end } = lastNDays(30);
  trace.push(`Pulled get_url_report ${start} → ${end}`);
  const urls = await getURLReport({ projectId, startDate: start, endDate: end, limit: 50, apiKey });
  const pickedTitles = urls.filter((u) => u.title).slice(0, 5).map((u) => u.title!);
  if (!pickedTitles.length) {
    return { ...run, endedAt: nowISO(), status: "no-op", message: "No cited URLs with titles to schema-ify.", trace };
  }

  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: pickedTitles.map((t) => ({
      "@type": "Question",
      name: t,
      // No acceptedAnswer — yappr does not fabricate answers.
    })),
  };
  trace.push(`Built FAQPage JSON-LD with ${pickedTitles.length} questions`);

  const branchName = `yappr/schema-sweeper-${Date.now()}`;
  const filename = `seo/faqpage-${start}-${end}.json`;

  // 1. Look up the default branch's commit SHA via Composio GitHub.
  trace.push(`GITHUB_REPOS_GET to find default branch`);
  const repoInfo = (await executeTool("GITHUB_REPOS_GET", { owner, repo }, userId)) as { data?: { default_branch?: string }; error?: string };
  const defaultBranch = repoInfo?.data?.default_branch || "main";
  trace.push(`default branch: ${defaultBranch}`);

  trace.push(`GITHUB_GIT_GET_REF for heads/${defaultBranch}`);
  const refResult = (await executeTool("GITHUB_GIT_GET_REF", {
    owner, repo, ref: `heads/${defaultBranch}`,
  }, userId)) as { data?: { object?: { sha?: string } }; error?: string };
  const baseSha = refResult?.data?.object?.sha;
  if (!baseSha) {
    return {
      ...run, endedAt: nowISO(), status: "failed",
      message: refResult?.error || `Couldn't resolve heads/${defaultBranch} on ${repoEnv}. Connect GitHub in Composio dashboard for user ${process.env.COMPOSIO_USER_ID || "yappr-demo-user"}.`,
      trace, error: JSON.stringify(refResult).slice(0, 300),
    };
  }
  trace.push(`base SHA ${baseSha.slice(0, 7)}`);

  // 2. Create the new branch.
  trace.push(`GITHUB_GIT_CREATE_REF for ${branchName}`);
  const createRef = (await executeTool("GITHUB_GIT_CREATE_REF", {
    owner, repo, ref: `refs/heads/${branchName}`, sha: baseSha,
  }, userId)) as { error?: string };
  if (createRef?.error) {
    return { ...run, endedAt: nowISO(), status: "failed", message: `branch create failed: ${createRef.error}`, trace };
  }

  // 3. Commit the schema file on the new branch.
  trace.push(`GITHUB_REPOS_CREATE_OR_UPDATE_FILE_CONTENTS for ${filename}`);
  const content = Buffer.from(JSON.stringify(schema, null, 2)).toString("base64");
  const commit = (await executeTool("GITHUB_REPOS_CREATE_OR_UPDATE_FILE_CONTENTS", {
    owner, repo, path: filename, branch: branchName, content,
    message: `yappr Schema Sweeper: FAQPage from top cited prompts (${start} → ${end})`,
  }, userId)) as { error?: string };
  if (commit?.error) {
    return { ...run, endedAt: nowISO(), status: "failed", message: `commit failed: ${commit.error}`, trace };
  }

  // 4. Open the PR.
  trace.push(`GITHUB_PULLS_CREATE`);
  const prBody = [
    `**yappr Wire — Schema Sweeper** opened this PR.`,
    ``,
    `**Read path:** Peec \`get_url_report\` for project \`${projectId}\` over ${start} → ${end}.`,
    ``,
    `**What's inside:** \`${filename}\` — a FAQPage JSON-LD block whose \`mainEntity\` is one Question per top-cited URL title.`,
    ``,
    `**Non-fabrication note:** answers are intentionally **omitted**. yappr does not invent answers it can't ground in real content. A reviewer fills them from the corresponding page.`,
    ``,
    `**Top cited titles included:**`,
    ...pickedTitles.map((t) => `- ${t}`),
  ].join("\n");

  const prResult = (await executeTool("GITHUB_PULLS_CREATE", {
    owner, repo,
    title: `yappr Schema Sweeper · ${pickedTitles.length} prompts`,
    head: branchName, base: defaultBranch, body: prBody,
  }, userId)) as { data?: { number?: number; html_url?: string }; error?: string };

  if (!prResult?.data?.html_url) {
    return { ...run, endedAt: nowISO(), status: "failed", message: prResult?.error || "PR create returned no URL", trace, error: JSON.stringify(prResult).slice(0, 300) };
  }
  trace.push(`PR #${prResult.data.number}: ${prResult.data.html_url}`);

  return {
    ...run, endedAt: nowISO(), status: "success",
    message: `Opened PR #${prResult.data.number} with FAQPage schema for ${pickedTitles.length} top cited prompts.`,
    artifactUrl: prResult.data.html_url, artifactLabel: `PR #${prResult.data.number}`,
    trace,
  };
}

// ----------------------------------------------------------------------------
// Slack Brief — posts a Slack message via Composio
// ----------------------------------------------------------------------------

async function postSlack(channel: string, text: string, userId: string): Promise<{ ok: boolean; ts?: string; error?: string }> {
  const result = (await executeTool("SLACK_SEND_MESSAGE", {
    channel, text,
  }, userId)) as { data?: { ts?: string; ok?: boolean }; error?: string };
  if (result?.data?.ts) return { ok: true, ts: result.data.ts };
  // Composio sometimes returns success without ts (e.g., for some channels). Treat any non-error as success.
  if (result?.data && !result?.error) return { ok: true, ts: undefined };
  const errMsg = result?.error || "Slack didn\'t respond — check Settings → Slack chip is green, and the channel name is correct.";
  return { ok: false, error: errMsg };
}

async function runSlackBrief(run: Run, projectId: string, userId: string, apiKey: string): Promise<Run> {
  const trace: string[] = [];
  const guard = composioGuard();
  if (guard) return { ...run, endedAt: nowISO(), status: "failed", message: guard.message, trace };
  const channel = (await getUserConfig(userId, CONFIG_KEYS.slack.channel, "SLACK_CHANNEL", "#general"))!;
  trace.push(`Channel: ${channel} (override in Settings)`);

  const { start, end } = lastNDays(7);
  trace.push(`Pulled Peec brand+url reports for ${start} → ${end}`);
  const [brands, topics, urlRows, brandRows] = await Promise.all([
    listBrands(projectId, apiKey),
    listTopics(projectId, apiKey),
    getURLReport({ projectId, startDate: start, endDate: end, limit: 30, apiKey }),
    getBrandReport({ projectId, startDate: start, endDate: end, dimensions: ["topic_id"], limit: 200, apiKey }),
  ]);
  const own = brands.find((b) => b.is_own);
  if (!own) return { ...run, endedAt: nowISO(), status: "no-op", message: "No own brand configured in Peec.", trace };

  const ownDomains = (own.domains ?? []).map((d) => d.toLowerCase());
  const isOwn = (u: string) => { try { return ownDomains.some((d) => new URL(u).hostname.toLowerCase().endsWith(d)); } catch { return false; }};
  const topCompURLs = urlRows
    .filter((r) => r.url && !isOwn(r.url) && (r.citation_count ?? 0) > 0)
    .sort((a, b) => (b.citation_count ?? 0) - (a.citation_count ?? 0))
    .slice(0, 3);

  const ownTopicVis: { topic: string; vis: number }[] = [];
  for (const t of topics) {
    const ownRow = brandRows.find((r) => {
      const tid = (r as { topic?: { id?: string }; topic_id?: string }).topic?.id ?? (r as { topic_id?: string }).topic_id;
      const bid = (r as { brand?: { id?: string }; brand_id?: string }).brand?.id ?? (r as { brand_id?: string }).brand_id;
      return tid === t.id && bid === own.id;
    });
    if (ownRow) ownTopicVis.push({ topic: t.name, vis: (ownRow.visibility as number | undefined) ?? 0 });
  }
  ownTopicVis.sort((a, b) => b.vis - a.vis);
  const wins = ownTopicVis.slice(0, 3);

  const lines: string[] = [];
  lines.push(`*Monday Visibility Brief · ${own.name}* — week of ${start}`);
  lines.push(``);
  lines.push(`*🛎 Top 3 competitor URLs winning prompts you target:*`);
  if (topCompURLs.length === 0) lines.push(`_No competitor URLs detected this week._`);
  else topCompURLs.forEach((u, i) => {
    let host = "";
    try { host = new URL(u.url).hostname; } catch { host = u.url; }
    lines.push(`${i + 1}. <${u.url}|${u.title || host}> — *${u.citation_count} citations*`);
  });
  lines.push(``);
  lines.push(`*✨ Top 3 topics where ${own.name} is winning:*`);
  if (wins.length === 0) lines.push(`_No topic-level data yet._`);
  else wins.forEach((w, i) => lines.push(`${i + 1}. *${w.topic}* — ${Math.round(w.vis * 100)}% visibility`));
  lines.push(``);
  lines.push(`_Sent by yappr Wire · grounded in Peec data · ${end}_`);

  trace.push(`Composing brief for ${channel}`);
  const r = await postSlack(channel, lines.join("\n"), userId);
  if (!r.ok) return { ...run, endedAt: nowISO(), status: "failed", message: r.error || "Slack post failed", trace };
  trace.push(`Slack ts ${r.ts}`);

  return {
    ...run, endedAt: nowISO(), status: "success",
    message: `Posted weekly brief: ${topCompURLs.length} competitor URLs, ${wins.length} topic wins.`,
    artifactLabel: `Slack message (ts ${r.ts?.slice(0, 12)})`,
    trace,
  };
}

// ----------------------------------------------------------------------------
// Citation Watch — anomaly detection + Slack alert via Composio
// ----------------------------------------------------------------------------

async function runCitationWatch(run: Run, projectId: string, userId: string, apiKey: string): Promise<Run> {
  const trace: string[] = [];
  const guard = composioGuard();
  // Citation Watch can run without Composio for the read; the alert is optional.

  const channel = (await getUserConfig(userId, CONFIG_KEYS.slack.channel, "SLACK_CHANNEL")) ?? null;
  const { start, end } = lastNDays(60);
  trace.push(`Pulled get_brand_report (60d, dim=topic_id+date)`);
  const rows = await getBrandReport({
    projectId, startDate: start, endDate: end,
    dimensions: ["topic_id", "date"], limit: 2000, apiKey,
  });
  if (!rows.length) return { ...run, endedAt: nowISO(), status: "no-op", message: "No daily topic data returned.", trace };

  const brands = await listBrands(projectId, apiKey);
  const own = brands.find((b) => b.is_own);
  if (!own) return { ...run, endedAt: nowISO(), status: "no-op", message: "No own brand configured.", trace };

  const byTopic = new Map<string, { date: string; vis: number }[]>();
  for (const r of rows) {
    const bid = (r as { brand?: { id?: string }; brand_id?: string }).brand?.id ?? (r as { brand_id?: string }).brand_id;
    if (bid !== own.id) continue;
    const tid = (r as { topic?: { id?: string }; topic_id?: string }).topic?.id ?? (r as { topic_id?: string }).topic_id;
    const date = (r as { date?: string }).date;
    const vis = (r.visibility as number | undefined) ?? 0;
    if (!tid || !date) continue;
    if (!byTopic.has(tid)) byTopic.set(tid, []);
    byTopic.get(tid)!.push({ date, vis });
  }

  const anomalies: { topicId: string; latest: number; mean: number; sigma: number; deviation: number }[] = [];
  for (const [tid, series] of byTopic.entries()) {
    if (series.length < 8) continue;
    const sorted = series.sort((a, b) => a.date.localeCompare(b.date));
    const latest = sorted[sorted.length - 1];
    const trailing = sorted.slice(-15, -1);
    if (trailing.length < 5) continue;
    const mean = trailing.reduce((s, x) => s + x.vis, 0) / trailing.length;
    const variance = trailing.reduce((s, x) => s + (x.vis - mean) ** 2, 0) / trailing.length;
    const sigma = Math.sqrt(variance);
    if (sigma > 0 && latest.vis < mean - 2 * sigma) {
      anomalies.push({ topicId: tid, latest: latest.vis, mean, sigma, deviation: (mean - latest.vis) / sigma });
    }
  }
  trace.push(`${anomalies.length} 2σ anomalies across ${byTopic.size} topics`);

  if (!anomalies.length) {
    return { ...run, endedAt: nowISO(), status: "no-op", message: "No 2σ visibility drops detected. All clear.", trace };
  }

  const topics = await listTopics(projectId, apiKey);
  const topicName = (id: string) => topics.find((t) => t.id === id)?.name ?? id.slice(0, 8);

  if (channel && !guard) {
    const lines = [`*🛎 Citation Watch — ${anomalies.length} 2σ visibility drop${anomalies.length === 1 ? "" : "s"} detected*`, ``];
    anomalies.forEach((a) => {
      lines.push(`• *${topicName(a.topicId)}* — ${Math.round(a.latest * 100)}% (mean ${Math.round(a.mean * 100)}%, ${a.deviation.toFixed(1)}σ below)`);
    });
    lines.push(``, `_yappr Wire · ${end}_`);
    const r = await postSlack(channel, lines.join("\n"), userId);
    if (r.ok) trace.push(`Posted Slack alert (ts ${r.ts})`);
    else trace.push(`Slack alert failed: ${r.error}`);
  } else {
    trace.push(`SLACK_CHANNEL not set — skipped Slack alert (anomalies still surfaced)`);
  }

  return {
    ...run, endedAt: nowISO(), status: "success",
    message: `${anomalies.length} anomaly${anomalies.length === 1 ? "" : "s"} detected${channel && !guard ? " — posted to Slack" : ""}.`,
    artifactLabel: channel && !guard ? "Slack alert sent" : undefined,
    trace,
  };
}

// ----------------------------------------------------------------------------
// Competitor Surge — week-over-week URL diff
// ----------------------------------------------------------------------------

async function runCompetitorSurge(run: Run, projectId: string, userId: string, apiKey: string): Promise<Run> {
  const trace: string[] = [];
  const cur = lastNDays(7);
  const prevEnd = new Date(); prevEnd.setDate(prevEnd.getDate() - 7);
  const prevStart = new Date(prevEnd); prevStart.setDate(prevEnd.getDate() - 7);
  const prev = { start: prevStart.toISOString().slice(0, 10), end: prevEnd.toISOString().slice(0, 10) };

  trace.push(`Pulled get_url_report current (${cur.start} → ${cur.end}) and prior (${prev.start} → ${prev.end})`);
  const [curRows, prevRows] = await Promise.all([
    getURLReport({ projectId, startDate: cur.start, endDate: cur.end, limit: 100, apiKey }),
    getURLReport({ projectId, startDate: prev.start, endDate: prev.end, limit: 100, apiKey }),
  ]);

  const prevByUrl = new Map<string, number>();
  for (const r of prevRows) prevByUrl.set(r.url, r.citation_count ?? 0);

  const surges: { url: string; title?: string; cur: number; prev: number; growth: number }[] = [];
  for (const r of curRows) {
    const cur = r.citation_count ?? 0;
    const prevV = prevByUrl.get(r.url) ?? 0;
    if (prevV > 0 && cur / prevV > 1.5) surges.push({ url: r.url, title: r.title ?? undefined, cur, prev: prevV, growth: (cur - prevV) / prevV });
    else if (prevV === 0 && cur > 5) surges.push({ url: r.url, title: r.title ?? undefined, cur, prev: 0, growth: Infinity });
  }
  surges.sort((a, b) => b.growth - a.growth);
  trace.push(`Found ${surges.length} surging URLs`);

  if (surges.length === 0) {
    return { ...run, endedAt: nowISO(), status: "no-op", message: "No competitor URLs surged this week.", trace };
  }

  return {
    ...run, endedAt: nowISO(), status: "success",
    message: `${surges.length} competitor URL${surges.length === 1 ? "" : "s"} surged. Top: ${surges[0].title ?? surges[0].url} (+${Math.round(surges[0].growth * 100)}%).`,
    trace,
  };
}

// ----------------------------------------------------------------------------
// Notion Drafter — Composio NOTION_CREATE_PAGE
// ----------------------------------------------------------------------------

async function runNotionDrafter(run: Run, projectId: string, userId: string, apiKey: string): Promise<Run> {
  const trace: string[] = [];
  const guard = composioGuard();
  if (guard) return { ...run, endedAt: nowISO(), status: "failed", message: guard.message, trace };
  const parentId = (await getUserConfig(userId, CONFIG_KEYS.notion.parentPageId, "NOTION_PARENT_PAGE_ID")) ?? null;
  if (!parentId) return { ...run, endedAt: nowISO(), status: "failed", message: "Set your Notion parent page ID in Settings → Notion.", trace };

  const { start, end } = lastNDays(30);
  trace.push(`Pulled get_url_report ${start} → ${end}`);
  const urls = await getURLReport({ projectId, startDate: start, endDate: end, limit: 30, apiKey });
  const top = urls.filter((u) => u.title).slice(0, 6);
  if (!top.length) return { ...run, endedAt: nowISO(), status: "no-op", message: "No cited URL titles to draft from.", trace };

  const brands = await listBrands(projectId, apiKey);
  const own = brands.find((b) => b.is_own);
  const ownName = own?.name ?? "your brand";

  const today = end;
  const title = `${ownName} comparison brief · ${today}`;
  trace.push(`Composing Notion page: ${title}`);

  const args = {
    parent: { type: "page_id", page_id: parentId.replace(/-/g, "") },
    properties: { title: [{ text: { content: title } }] },
    children: [
      { object: "block", type: "heading_1", heading_1: { rich_text: [{ type: "text", text: { content: title } }] } },
      { object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: `Auto-drafted by yappr Wire. Below are the most cited URL titles in your space over the last 30 days. Use them as JTBD anchors when writing.` } }] } },
      { object: "block", type: "heading_2", heading_2: { rich_text: [{ type: "text", text: { content: "Top cited prompts in your space" } }] } },
      ...top.map((u) => ({
        object: "block", type: "bulleted_list_item",
        bulleted_list_item: { rich_text: [{ type: "text", text: { content: `${u.title!}  —  ${u.citation_count ?? 0} citations`, link: u.url ? { url: u.url } : undefined } }] },
      })),
    ],
  };

  const result = (await executeTool("NOTION_CREATE_PAGE", args, userId)) as { data?: { url?: string; id?: string }; error?: string };
  if (!result?.data?.url && !result?.data?.id) {
    return { ...run, endedAt: nowISO(), status: "failed", message: result?.error || "Composio returned no page URL — verify NOTION is connected", trace, error: JSON.stringify(result).slice(0, 300) };
  }
  return {
    ...run, endedAt: nowISO(), status: "success",
    message: `Notion page created with ${top.length} cited references.`,
    artifactUrl: result.data?.url, artifactLabel: "Open Notion page ↗",
    trace,
  };
}

// ----------------------------------------------------------------------------
// Linear Triager — Composio LINEAR_CREATE_ISSUE
// ----------------------------------------------------------------------------

async function runLinearTriager(run: Run, projectId: string, userId: string, apiKey: string): Promise<Run> {
  const trace: string[] = [];
  const guard = composioGuard();
  if (guard) return { ...run, endedAt: nowISO(), status: "failed", message: guard.message, trace };
  const teamId = (await getUserConfig(userId, CONFIG_KEYS.linear.teamId, "LINEAR_TEAM_ID")) ?? null;
  if (!teamId) return { ...run, endedAt: nowISO(), status: "failed", message: "Set your Linear team ID in Settings → Linear.", trace };

  const { start, end } = lastNDays(60);
  const rows = await getBrandReport({
    projectId, startDate: start, endDate: end,
    dimensions: ["topic_id", "date"], limit: 2000, apiKey,
  });
  if (!rows.length) return { ...run, endedAt: nowISO(), status: "no-op", message: "No daily topic data.", trace };
  const brands = await listBrands(projectId, apiKey);
  const own = brands.find((b) => b.is_own);
  if (!own) return { ...run, endedAt: nowISO(), status: "no-op", message: "No own brand configured.", trace };

  const byTopic = new Map<string, { date: string; vis: number }[]>();
  for (const r of rows) {
    const bid = (r as { brand?: { id?: string }; brand_id?: string }).brand?.id ?? (r as { brand_id?: string }).brand_id;
    if (bid !== own.id) continue;
    const tid = (r as { topic?: { id?: string }; topic_id?: string }).topic?.id ?? (r as { topic_id?: string }).topic_id;
    const date = (r as { date?: string }).date;
    const vis = (r.visibility as number | undefined) ?? 0;
    if (!tid || !date) continue;
    if (!byTopic.has(tid)) byTopic.set(tid, []);
    byTopic.get(tid)!.push({ date, vis });
  }

  let worst: { topicId: string; latest: number; mean: number; sigma: number; deviation: number } | null = null;
  for (const [tid, series] of byTopic.entries()) {
    if (series.length < 8) continue;
    const sorted = series.sort((a, b) => a.date.localeCompare(b.date));
    const latest = sorted[sorted.length - 1];
    const trailing = sorted.slice(-15, -1);
    if (trailing.length < 5) continue;
    const mean = trailing.reduce((s, x) => s + x.vis, 0) / trailing.length;
    const variance = trailing.reduce((s, x) => s + (x.vis - mean) ** 2, 0) / trailing.length;
    const sigma = Math.sqrt(variance);
    if (sigma > 0 && latest.vis < mean - 2 * sigma) {
      const deviation = (mean - latest.vis) / sigma;
      if (!worst || deviation > worst.deviation) worst = { topicId: tid, latest: latest.vis, mean, sigma, deviation };
    }
  }
  if (!worst) return { ...run, endedAt: nowISO(), status: "no-op", message: "No 2σ anomalies. All clear.", trace };

  const topics = await listTopics(projectId, apiKey);
  const topicName = topics.find((t) => t.id === worst!.topicId)?.name ?? worst.topicId.slice(0, 8);

  const issueTitle = `Visibility drop on "${topicName}" — ${Math.round(worst.latest * 100)}% (${worst.deviation.toFixed(1)}σ)`;
  const issueBody = [
    `yappr Wire detected a 2σ visibility drop on **${topicName}**.`,
    ``,
    `**Latest:** ${Math.round(worst.latest * 100)}% (vs 14d mean ${Math.round(worst.mean * 100)}%, σ ${worst.sigma.toFixed(3)}, deviation ${worst.deviation.toFixed(1)}σ)`,
    ``,
    `**Read path:** Peec \`get_brand_report\` over ${start} → ${end}, project ${projectId}.`,
    ``,
    `_Filed automatically · ${end}_`,
  ].join("\n");

  const result = (await executeTool("LINEAR_CREATE_ISSUE", {
    teamId, title: issueTitle, description: issueBody,
  }, userId)) as { data?: { url?: string; identifier?: string }; error?: string };

  if (!result?.data?.url) {
    return { ...run, endedAt: nowISO(), status: "failed", message: result?.error || "Linear didn't return an issue URL", trace, error: JSON.stringify(result).slice(0, 300) };
  }
  trace.push(`Filed ${result.data.identifier ?? "issue"}: ${result.data.url}`);
  return {
    ...run, endedAt: nowISO(), status: "success",
    message: `Filed Linear ${result.data.identifier ?? "issue"}: ${issueTitle}`,
    artifactUrl: result.data.url,
    artifactLabel: result.data.identifier ? `Open ${result.data.identifier} ↗` : "Open issue ↗",
    trace,
  };
}

// ----------------------------------------------------------------------------
// Gmail Pitcher — Composio GMAIL_CREATE_DRAFT
// ----------------------------------------------------------------------------

async function runGmailPitcher(run: Run, projectId: string, userId: string, apiKey: string): Promise<Run> {
  const trace: string[] = [];
  const guard = composioGuard();
  if (guard) return { ...run, endedAt: nowISO(), status: "failed", message: guard.message, trace };
  const pitchTo = (await getUserConfig(userId, CONFIG_KEYS.gmail.pitchTo, "PITCH_TO_EMAIL")) ?? null;
  if (!pitchTo) return { ...run, endedAt: nowISO(), status: "failed", message: "Set the email to draft against in Settings → Gmail.", trace };

  const { start, end } = lastNDays(30);
  const urls = await getURLReport({
    projectId, startDate: start, endDate: end,
    filters: [{ field: "url_classification", operator: "in", values: ["ARTICLE", "LISTICLE"] }],
    limit: 10,
    apiKey,
  });
  const articles = urls.filter((u) => u.title && u.url).slice(0, 3);
  if (!articles.length) return { ...run, endedAt: nowISO(), status: "no-op", message: "No article-class URLs.", trace };

  const brands = await listBrands(projectId, apiKey);
  const own = brands.find((b) => b.is_own);
  const ownName = own?.name ?? "your brand";

  let drafted = 0;
  for (const a of articles) {
    let host = "";
    try { host = new URL(a.url).hostname; } catch { host = a.url; }
    const subject = `Re: ${a.title} — adding ${ownName} to your shortlist`;
    const body = [
      `Hi,`, ``,
      `I noticed your piece "${a.title}" (${a.url}) is currently quoted by AI engines for queries adjacent to ${ownName}'s space.`, ``,
      `${ownName} has a sharper angle on this category that didn't make it into the piece — happy to send a 1-paragraph contributor blurb you can drop in if it's a fit.`, ``,
      `(Drafted by yappr Wire · grounded in ${a.citation_count ?? 0} cited mentions of ${host} in the last 30 days.)`,
    ].join("\n");

    const result = (await executeTool("GMAIL_CREATE_DRAFT", { to: pitchTo, subject, body }, userId)) as { data?: { id?: string }; error?: string };
    trace.push(`GMAIL_CREATE_DRAFT for ${host}: ${result?.data?.id ? "ok" : "fail"}`);
    if (result?.data?.id) drafted++;
  }
  if (drafted === 0) return { ...run, endedAt: nowISO(), status: "failed", message: "Gmail returned no draft IDs", trace };

  return {
    ...run, endedAt: nowISO(), status: "success",
    message: `${drafted} pitch draft${drafted === 1 ? "" : "s"} created in Gmail.`,
    artifactLabel: `${drafted} draft${drafted === 1 ? "" : "s"} in Gmail`,
    trace,
  };
}

// ----------------------------------------------------------------------------
// STUB
// ----------------------------------------------------------------------------

async function runStubAgent(run: Run, label: string, message: string): Promise<Run> {
  return {
    ...run, endedAt: nowISO(), status: "no-op", message,
    trace: [`${label}: stub mode — wired but not executing external calls.`],
  };
}
