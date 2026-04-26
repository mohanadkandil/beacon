import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import type { OutputField } from "@/lib/agent-catalog";
import type { CanvasNode, CanvasEdge } from "@/lib/wire/graph-builder";
import { executeTool } from "@/lib/wire/composio";
import { getUserConfig, CONFIG_KEYS } from "@/lib/wire/user-config-store";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

/**
 * POST /api/wire/test-agent
 * Body: {
 *   systemPrompt, outputFields, agentName?,         // agent to dry-run
 *   nodes?, edges?, agentNodeId?, userId?,          // graph context for downstream actions
 *   sampleInput?,
 * }
 *
 * Two phases:
 *  1. Run the agent through OpenRouter with structured outputs.
 *  2. If a graph + userId are provided, walk downstream action nodes from the
 *     agent and actually fire them (Slack today; GitHub/Notion/Linear/Gmail
 *     will follow the same pattern). Each action's success/failure is
 *     reported back so the canvas toast can show real artifacts.
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const modelId = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "OPENROUTER_API_KEY not set in .env.local" }, { status: 500 });
  }

  let body: {
    systemPrompt?: string;
    outputFields?: OutputField[];
    sampleInput?: string;
    agentName?: string;
    nodes?: CanvasNode[];
    edges?: CanvasEdge[];
    agentNodeId?: string;
    userId?: string;
  } = {};
  try { body = await req.json(); } catch {}
  const systemPrompt = (body.systemPrompt ?? "").trim();
  const outputFields = body.outputFields ?? [];
  if (!systemPrompt) return NextResponse.json({ ok: false, error: "systemPrompt required" }, { status: 400 });
  if (!outputFields.length) return NextResponse.json({ ok: false, error: "outputFields required" }, { status: 400 });

  const userMsg = body.sampleInput?.trim() ||
    "No upstream Peec data is wired in this dry run. Demonstrate your output by inventing realistic placeholder values that match the schema, and label them clearly as illustrative.";

  const schema = compileZodSchema(outputFields);

  // --- Phase 1: run the agent -------------------------------------------
  let output: Record<string, unknown>;
  try {
    const openrouter = createOpenRouter({ apiKey });
    const result = await generateObject({
      model: openrouter(modelId),
      schema,
      system: systemPrompt,
      prompt: userMsg,
      temperature: 0.4,
    });
    output = unpackObjectArrays(result.object as Record<string, unknown>, outputFields);
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 200 });
  }

  // --- Phase 2: walk downstream action nodes and fire them --------------
  const executions: { node: string; tool: string; ok: boolean; message: string; artifactUrl?: string }[] = [];

  if (body.nodes && body.edges && body.agentNodeId && body.userId) {
    const downstream = collectDownstream(body.nodes, body.edges, body.agentNodeId);
    const actionNodes = downstream.filter((n) => n.kind === "action" && n.toolSlug);
    for (const node of actionNodes) {
      try {
        const r = await fireActionNode(node, output, outputFields, body.agentName ?? "Agent", body.userId);
        executions.push({ node: node.label || node.id, tool: node.toolSlug!, ...r });
      } catch (err) {
        executions.push({ node: node.label || node.id, tool: node.toolSlug!, ok: false, message: (err as Error).message });
      }
    }
  }

  return NextResponse.json({ ok: true, model: modelId, output, executions });
}

// ---------------------------------------------------------------------------

/** BFS from `start` over `edges` (directed). Returns nodes reachable downstream. */
function collectDownstream(nodes: CanvasNode[], edges: CanvasEdge[], startId: string): CanvasNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push(e.to);
  }
  const seen = new Set<string>([startId]);
  const queue = [startId];
  const out: CanvasNode[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    for (const next of adj.get(id) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      const n = byId.get(next);
      if (n) out.push(n);
      queue.push(next);
    }
  }
  return out;
}

/** Dispatch a single action node. Each tool has a tiny adapter that maps the
 * agent's structured output into a tool-specific call via Composio. */
async function fireActionNode(
  node: CanvasNode,
  agentOutput: Record<string, unknown>,
  outputFields: OutputField[],
  agentName: string,
  userId: string,
): Promise<{ ok: boolean; message: string; artifactUrl?: string }> {
  const markdown = formatForChannel(agentName, agentOutput, outputFields);
  const today = new Date().toISOString().slice(0, 10);

  switch (node.toolSlug) {
    case "slack": {
      const channel = await getUserConfig(userId, CONFIG_KEYS.slack.channel, "SLACK_CHANNEL");
      if (!channel) return { ok: false, message: "Set a Slack channel in Settings → Slack first." };
      const blocks = buildSlackBlocks(agentName, agentOutput, outputFields);
      const r = (await executeTool("SLACK_SEND_MESSAGE", {
        channel,
        text: `yappr · ${agentName}`,        // fallback for notifications
        blocks,
        username: "yappr",
        icon_emoji: ":satellite_antenna:",
        unfurl_links: false,
        unfurl_media: false,
      }, userId)) as { data?: { ok?: boolean; error?: string }; error?: string };
      return r?.data?.ok
        ? { ok: true, message: `Posted to ${channel}` }
        : { ok: false, message: r?.data?.error || r?.error || "Slack send failed" };
    }

    case "github": {
      const repoStr = await getUserConfig(userId, CONFIG_KEYS.github.repo, "GITHUB_REPO");
      if (!repoStr || !repoStr.includes("/")) {
        return { ok: false, message: "Set GitHub repo (owner/repo) in Settings → GitHub first." };
      }
      const [owner, repo] = repoStr.split("/", 2);
      const title = `yappr · ${agentName} · ${today}`;
      const body = `${markdown}\n\n---\n_Auto-filed by yappr Wire test run on ${today}._`;
      const r = (await executeTool("GITHUB_ISSUES_CREATE", { owner, repo, title, body }, userId)) as { data?: { html_url?: string; number?: number; message?: string }; error?: string };
      const url = r?.data?.html_url;
      const num = r?.data?.number;
      if (!url) return { ok: false, message: r?.data?.message || r?.error || "GitHub issue create failed" };
      return { ok: true, message: `Filed issue #${num} on ${owner}/${repo}`, artifactUrl: url };
    }

    case "linear": {
      const teamId = await getUserConfig(userId, CONFIG_KEYS.linear.teamId, "LINEAR_TEAM_ID");
      if (!teamId) return { ok: false, message: "Set Linear team id in Settings → Linear first." };
      const title = `yappr · ${agentName} · ${today}`;
      const description = markdown;
      const r = (await executeTool("LINEAR_CREATE_ISSUE", { teamId, title, description }, userId)) as { data?: { issue?: { url?: string; identifier?: string } }; error?: string };
      const url = r?.data?.issue?.url;
      const ident = r?.data?.issue?.identifier;
      if (!url) return { ok: false, message: r?.error || "Linear create failed" };
      return { ok: true, message: `Filed ${ident ?? "issue"} in Linear`, artifactUrl: url };
    }

    case "notion": {
      const parentRaw = await getUserConfig(userId, CONFIG_KEYS.notion.parentPageId, "NOTION_PARENT_PAGE_ID");
      if (!parentRaw) return { ok: false, message: "Set Notion parent page id in Settings → Notion first." };
      const parentId = parentRaw.replace(/-/g, "");
      const title = `yappr · ${agentName} · ${today}`;
      const blocks = markdownToNotionBlocks(markdown);
      const args = {
        parent: { type: "page_id", page_id: parentId },
        properties: { title: [{ text: { content: title } }] },
        children: blocks,
      };
      const r = (await executeTool("NOTION_CREATE_PAGE", args, userId)) as { data?: { url?: string; id?: string }; error?: string };
      const url = r?.data?.url;
      if (!url && !r?.data?.id) return { ok: false, message: r?.error || "Notion create failed" };
      return { ok: true, message: `Created Notion page`, artifactUrl: url };
    }

    case "gmail": {
      const to = await getUserConfig(userId, CONFIG_KEYS.gmail.pitchTo, "PITCH_TO_EMAIL");
      if (!to) return { ok: false, message: "Set a recipient email in Settings → Gmail first." };
      const subject = `yappr · ${agentName} · ${today}`;
      const body = stripMarkdownEmphasis(markdown);
      const r = (await executeTool("GMAIL_CREATE_DRAFT", { to, subject, body }, userId)) as { data?: { id?: string; message?: { id?: string } }; error?: string };
      const id = r?.data?.id ?? r?.data?.message?.id;
      if (!id) return { ok: false, message: r?.error || "Gmail draft create failed" };
      return { ok: true, message: `Drafted email to ${to}` };
    }

    default:
      return { ok: false, message: `Unknown tool: ${node.toolSlug}` };
  }
}

/** Lossy markdown → Notion block conversion. Headings, paragraphs, bullets. */
function markdownToNotionBlocks(md: string): unknown[] {
  const blocks: unknown[] = [];
  const lines = md.split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("# ")) {
      blocks.push({ object: "block", type: "heading_1", heading_1: { rich_text: [{ type: "text", text: { content: line.slice(2) } }] } });
    } else if (line.startsWith("## ")) {
      blocks.push({ object: "block", type: "heading_2", heading_2: { rich_text: [{ type: "text", text: { content: line.slice(3) } }] } });
    } else if (line.startsWith("- ") || line.startsWith("• ") || /^\d+\.\s/.test(line)) {
      const content = line.replace(/^(?:- |• |\d+\.\s)/, "");
      blocks.push({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ type: "text", text: { content } }] } });
    } else {
      blocks.push({ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: line } }] } });
    }
  }
  return blocks;
}

/** Cheap emphasis stripper for plain-text email bodies. */
function stripMarkdownEmphasis(md: string): string {
  return md
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1");
}

/** Render the agent's structured output as a Slack-friendly markdown message. */
function formatForChannel(agentName: string, output: Record<string, unknown>, fields: OutputField[]): string {
  const lines: string[] = [`*yappr · ${agentName}*`];
  for (const f of fields) {
    const v = output[f.name];
    if (v == null) continue;
    if (f.type === "markdown") { lines.push("", String(v)); continue; }
    if (f.type === "string"  ) { lines.push("", `*${prettyName(f.name)}*  ${String(v)}`); continue; }
    if (f.type === "number"  ) { lines.push("", `*${prettyName(f.name)}*  ${v}`); continue; }
    if (f.type === "boolean" ) { lines.push("", `*${prettyName(f.name)}*  ${v ? "yes" : "no"}`); continue; }
    if (f.type === "string[]" && Array.isArray(v)) {
      lines.push("", `*${prettyName(f.name)}*`);
      for (const s of v) lines.push(`  • ${String(s)}`);
      continue;
    }
    if (f.type === "object[]" && Array.isArray(v)) {
      lines.push("", `*${prettyName(f.name)}*`);
      v.forEach((item, i) => {
        if (item && typeof item === "object") {
          const obj = item as Record<string, unknown>;
          const head = (obj.title ?? obj.name ?? obj.headline ?? obj.topic_name ?? obj.prompt_or_topic ?? `item ${i + 1}`) as string;
          const score = (obj.opportunity_score ?? obj.score ?? obj.confidence) as string | number | undefined;
          lines.push(`  ${i + 1}. *${head}*${score != null ? ` _(${score})_` : ""}`);
          for (const [k, val] of Object.entries(obj)) {
            if (["title", "name", "headline", "topic_name", "prompt_or_topic", "opportunity_score", "score", "confidence"].includes(k)) continue;
            lines.push(`     · _${k}:_ ${stringifyShort(val)}`);
          }
        } else {
          lines.push(`  ${i + 1}. ${String(item)}`);
        }
      });
      continue;
    }
  }
  return lines.join("\n");
}

function prettyName(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function stringifyShort(v: unknown): string {
  if (v == null) return "—";
  if (Array.isArray(v)) return v.map((x) => String(x)).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** OutputField[] → Zod object schema. */
function compileZodSchema(fields: OutputField[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) shape[f.name] = fieldToZod(f);
  return z.object(shape);
}
function fieldToZod(f: OutputField): z.ZodTypeAny {
  const desc = f.description || undefined;
  switch (f.type) {
    case "string":
    case "markdown":
      return desc ? z.string().describe(desc) : z.string();
    case "number":
      return desc ? z.number().describe(desc) : z.number();
    case "boolean":
      return desc ? z.boolean().describe(desc) : z.boolean();
    case "string[]":
      return desc ? z.array(z.string()).describe(desc) : z.array(z.string());
    case "object[]":
      return z.array(z.string()).describe(`${desc ? desc + " " : ""}(emit each item as a JSON-encoded string)`);
  }
}

function unpackObjectArrays(obj: Record<string, unknown>, fields: OutputField[]): Record<string, unknown> {
  const out: Record<string, unknown> = { ...obj };
  for (const f of fields) {
    if (f.type !== "object[]") continue;
    const raw = out[f.name];
    if (!Array.isArray(raw)) continue;
    out[f.name] = raw.map((item) => {
      if (typeof item !== "string") return item;
      try { return JSON.parse(item); } catch { return item; }
    });
  }
  return out;
}

/** Build a Slack Block Kit payload from the agent's structured output.
 * Header + context (run metadata) + divider + per-field sections + footer.
 * Slack truncates blocks beyond ~50, so we cap object[] items at 8. */
function buildSlackBlocks(agentName: string, output: Record<string, unknown>, fields: OutputField[]): unknown[] {
  const ts = new Date();
  const stamp = ts.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  const blocks: unknown[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `🛰  yappr · ${agentName}`, emoji: true },
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `*Wire patch* fired via ▸ test run  ·  ${stamp}` },
      ],
    },
    { type: "divider" },
  ];

  for (const f of fields) {
    const v = output[f.name];
    if (v == null) continue;

    if (f.type === "markdown" || f.type === "string") {
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `*${prettyName(f.name)}*\n${String(v)}` },
      });
      continue;
    }
    if (f.type === "number") {
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `*${prettyName(f.name)}*  \`${v}\`` },
      });
      continue;
    }
    if (f.type === "boolean") {
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `*${prettyName(f.name)}*  ${v ? "✅ yes" : "—"}` },
      });
      continue;
    }
    if (f.type === "string[]" && Array.isArray(v)) {
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `*${prettyName(f.name)}*\n${v.map((s) => `•  ${String(s)}`).join("\n")}` },
      });
      continue;
    }
    if (f.type === "object[]" && Array.isArray(v)) {
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `*${prettyName(f.name)}*  _(${v.length})_` },
      });
      const capped = v.slice(0, 8);
      for (let i = 0; i < capped.length; i++) {
        const item = capped[i] as Record<string, unknown>;
        if (!item || typeof item !== "object") continue;
        const head = (item.title ?? item.name ?? item.headline ?? item.topic_name ?? item.prompt_or_topic ?? `item ${i + 1}`) as string;
        const score = (item.opportunity_score ?? item.score ?? item.confidence) as string | number | undefined;
        const subline: string[] = [];
        for (const [k, val] of Object.entries(item)) {
          if (["title", "name", "headline", "topic_name", "prompt_or_topic", "opportunity_score", "score", "confidence"].includes(k)) continue;
          subline.push(`*${prettyName(k)}:* ${stringifyShort(val)}`);
        }
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${i + 1}.  ${head}*${score != null ? `   \`${typeof score === "number" ? score.toFixed(2) : score}\`` : ""}\n${subline.join("  ·  ")}`,
          },
        });
      }
      if (v.length > capped.length) {
        blocks.push({
          type: "context",
          elements: [{ type: "mrkdwn", text: `_+${v.length - capped.length} more — full output in the Wire run feed._` }],
        });
      }
      continue;
    }
  }

  blocks.push({ type: "divider" });
  blocks.push({
    type: "context",
    elements: [
      { type: "mrkdwn", text: "🛠  *yappr Wire*  ·  Cursor for marketers · powered by *Peec MCP* + *Composio MCP*" },
    ],
  });

  return blocks;
}

