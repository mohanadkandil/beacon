/**
 * Wire — recipe definitions.
 *
 * Each recipe is an agent: trigger + read + (optional) think + write.
 * All read-side data comes from Peec MCP/REST. Write-side actions go through
 * external SDKs (Octokit, Slack webhook, etc.) — Peec MCP is read-only.
 *
 * v0: recipes are static. Phase 2 (visual builder) will let users compose
 * their own from MCP tool nodes.
 */

import type { LintPigment } from "@/lib/lints";

export type RecipeStatus = "live" | "stub" | "coming_soon";
export type Trigger =
  | { kind: "cron"; cronSpec: string; humanLabel: string }
  | { kind: "anomaly"; thresholdLabel: string }
  | { kind: "manual"; humanLabel: string };

export type Recipe = {
  id: string;
  name: string;
  /** One-line description shown on the card. */
  description: string;
  /** Pigment used for the card accent + run-feed entry. */
  pigment: LintPigment;
  emoji: string;
  trigger: Trigger;
  /** Human-readable read-side data path. */
  reads: string[];
  /** Human-readable write-side action. */
  writes: string;
  /** "live" agents fire real external calls when run; "stub" simulate. */
  status: RecipeStatus;
  /** Required env vars for live execution. */
  requiresEnv: string[];
  /** What configuration fields the user can tweak. */
  configurable?: { key: string; label: string; default: string | number; kind: "text" | "number" | "select"; options?: string[] }[];
  /** Composio toolkit slug this patch needs connected to actually fire. */
  tool?: "github" | "slack" | "notion" | "linear" | "gmail";
};

export const RECIPES: Recipe[] = [
  {
    id: "schema-sweeper",
    name: "Schema Sweeper",
    description: "Finds your top cited prompts, generates JSON-LD for the answers, opens a GitHub PR.",
    pigment: "peach",
    emoji: "🪄",
    trigger: { kind: "cron", cronSpec: "0 9 * * *", humanLabel: "Daily · 9:00 local" },
    reads: ["Peec · get_brand_report", "Peec · get_url_report"],
    writes: "GitHub PR (via Composio · GITHUB_PULLS_CREATE)",
    status: "live",
    requiresEnv: ["COMPOSIO_API_KEY", "GITHUB_REPO"],
    configurable: [
      { key: "minCitationCount", label: "Min citation count to act", default: 5, kind: "number" },
    ],
    tool: "github",
  },
  {
    id: "slack-brief",
    name: "Monday Visibility Brief",
    description: "Posts the week's top 3 lints + 3 wins to Slack so the team starts Monday with priorities.",
    pigment: "lavender",
    emoji: "🪟",
    trigger: { kind: "cron", cronSpec: "0 8 * * 1", humanLabel: "Mondays · 8:00 local" },
    reads: ["Peec · get_brand_report", "Peec · get_url_report"],
    writes: "Slack message (via Composio · SLACK_SEND_MESSAGE)",
    status: "live",
    requiresEnv: ["COMPOSIO_API_KEY", "SLACK_CHANNEL"],
    configurable: [
      { key: "channel", label: "Channel hint", default: "#marketing", kind: "text" },
    ],
    tool: "slack",
  },
  {
    id: "citation-watch",
    name: "Citation Watch",
    description: "Detects 2σ visibility drops on tracked topics and files an incident with the autopsy.",
    pigment: "rose",
    emoji: "🛎",
    trigger: { kind: "anomaly", thresholdLabel: "≥ 2σ below 14d rolling mean" },
    reads: ["Peec · get_brand_report", "Peec · get_chat"],
    writes: "Slack alert (via Composio)",
    status: "stub",
    requiresEnv: ["COMPOSIO_API_KEY", "SLACK_CHANNEL"],
    configurable: [
      { key: "sigma", label: "Sigma threshold", default: 2, kind: "number" },
      { key: "topicsScope", label: "Topics scope", default: "all", kind: "select", options: ["all", "tracked-only"] },
    ],
    tool: "slack",
  },
  {
    id: "competitor-surge",
    name: "Competitor Surge",
    description: "Watches for competitor URLs gaining > 50% citations week-over-week. Drafts a counter in Quill.",
    pigment: "peach",
    emoji: "📈",
    trigger: { kind: "cron", cronSpec: "0 9 * * 1", humanLabel: "Mondays · 9:00 local" },
    reads: ["Peec · get_url_report (week-over-week diff)"],
    writes: "Quill draft (queued for review)",
    status: "stub",
    requiresEnv: [],
    configurable: [
      { key: "growthThreshold", label: "Citation growth %", default: 50, kind: "number" },
    ],
  },
  {
    id: "stale-content",
    name: "Stale Content Sweeper",
    description: "Finds your URLs whose citation rate has fallen 30d-over-prior-30d. Drafts rewrite suggestions.",
    pigment: "sage",
    emoji: "🍃",
    trigger: { kind: "cron", cronSpec: "0 10 * * 1", humanLabel: "Mondays · 10:00 local" },
    reads: ["Peec · get_url_report (own brand only)"],
    writes: "Notion draft per URL",
    status: "stub",
    requiresEnv: ["NOTION_API_KEY"],
    configurable: [
      { key: "declineThreshold", label: "Citation decline %", default: 25, kind: "number" },
    ],
  },
  {
    id: "lift-auditor",
    name: "Lift Auditor",
    description: "14 days after any agent action, measures visibility delta on the affected prompts. Posts to Slack.",
    pigment: "mint",
    emoji: "📊",
    trigger: { kind: "anomaly", thresholdLabel: "+14d after any agent action" },
    reads: ["Peec · get_brand_report (delta vs pre-action baseline)"],
    writes: "Slack report",
    status: "stub",
    requiresEnv: ["COMPOSIO_API_KEY", "SLACK_CHANNEL"],
    tool: "slack",
  },
  {
    id: "notion-drafter",
    name: "Notion Drafter",
    description: "Drafts a comparison page in Notion grounded in this week's top cited prompts. Routed via Composio MCP.",
    pigment: "lavender",
    emoji: "📓",
    trigger: { kind: "cron", cronSpec: "0 11 * * 1", humanLabel: "Mondays · 11:00 local" },
    reads: ["Peec · get_url_report"],
    writes: "Notion page (via Composio · NOTION_CREATE_PAGE)",
    status: "live",
    requiresEnv: ["COMPOSIO_API_KEY", "NOTION_PARENT_PAGE_ID"],
    configurable: [
      { key: "topicSlug", label: "Topic / phrase", default: "AI sourcing tools", kind: "text" },
    ],
    tool: "notion",
  },
  {
    id: "linear-triager",
    name: "Linear Triager",
    description: "When a 2σ visibility drop hits, files a Linear issue with the autopsy attached. Routed via Composio MCP.",
    pigment: "rose",
    emoji: "🛠",
    trigger: { kind: "anomaly", thresholdLabel: "≥ 2σ visibility drop on a tracked topic" },
    reads: ["Peec · get_brand_report (60d)"],
    writes: "Linear issue (via Composio · LINEAR_CREATE_ISSUE)",
    status: "live",
    requiresEnv: ["COMPOSIO_API_KEY", "LINEAR_TEAM_ID"],
    configurable: [
      { key: "sigma", label: "Sigma threshold", default: 2, kind: "number" },
    ],
    tool: "linear",
  },
  {
    id: "gmail-pitcher",
    name: "Gmail Pitcher",
    description: "Finds journalists/authors of articles citing your space. Drafts a pitch email per author. Routed via Composio MCP.",
    pigment: "clay" as LintPigment,
    emoji: "✉",
    trigger: { kind: "cron", cronSpec: "0 9 * * 2", humanLabel: "Tuesdays · 9:00 local" },
    reads: ["Peec · get_url_report (classification=ARTICLE)"],
    writes: "Gmail drafts (via Composio · GMAIL_CREATE_DRAFT)",
    status: "live",
    requiresEnv: ["COMPOSIO_API_KEY", "PITCH_TO_EMAIL"],
    configurable: [
      { key: "maxDrafts", label: "Max drafts per run", default: 3, kind: "number" },
    ],
    tool: "gmail",
  },
  {
    id: "press-pitch",
    name: "Schema Coverage Report",
    description: "Weekly check on what % of your top cited URLs use JSON-LD vs competitors'. Slack summary.",
    pigment: "lavender",
    emoji: "🗂",
    trigger: { kind: "cron", cronSpec: "0 8 * * 5", humanLabel: "Fridays · 8:00 local" },
    reads: ["Peec · get_url_report"],
    writes: "Slack summary",
    status: "coming_soon",
    requiresEnv: ["COMPOSIO_API_KEY", "SLACK_CHANNEL"],
    tool: "slack",
  },
];

export function getRecipe(id: string): Recipe | undefined {
  return RECIPES.find((r) => r.id === id);
}
