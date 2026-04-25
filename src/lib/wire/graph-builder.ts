/**
 * Build a canvas graph (nodes + edges) from a Recipe's metadata.
 * Used to render pre-built patches in the canvas without hand-crafting each one.
 */

import type { Recipe } from "./recipes";

export type CanvasNode = {
  id: string;
  kind: "trigger-cron" | "trigger-anomaly" | "peec-read" | "peec-write" | "claude-think" | "action";
  x: number;
  y: number;
  label: string;
  config?: string;
  toolSlug?: string;
  /** For claude-think nodes — which preset agent the user picked. */
  agentSlug?: string;
  /** For claude-think nodes — the editable system prompt (overrides preset default). */
  prompt?: string;
  /** For claude-think nodes — the editable structured output schema. JSON-encoded
   * array of OutputField (kept as a string to keep CanvasNode JSON-serializable). */
  outputFieldsJson?: string;
};

export type CanvasEdge = { from: string; to: string };

const COL_X = [60, 320, 580, 840, 1100];
const ROW_GAP = 130;

function inferToolSlug(writes: string): string | undefined {
  const w = writes.toLowerCase();
  if (w.includes("github") || w.includes("pr"))         return "github";
  if (w.includes("slack"))                               return "slack";
  if (w.includes("notion"))                              return "notion";
  if (w.includes("linear"))                              return "linear";
  if (w.includes("gmail") || w.includes("email"))        return "gmail";
  return undefined;
}

function inferActionLabel(writes: string): string {
  if (writes.toLowerCase().includes("github"))  return "GitHub PR";
  if (writes.toLowerCase().includes("slack"))   return "Slack message";
  if (writes.toLowerCase().includes("notion"))  return "Notion page";
  if (writes.toLowerCase().includes("linear"))  return "Linear issue";
  if (writes.toLowerCase().includes("gmail"))   return "Gmail draft";
  return "Action";
}

function inferActionConfig(writes: string): string {
  // "GitHub PR (via Composio · GITHUB_PULLS_CREATE)" -> "Composio · GITHUB_PULLS_CREATE"
  const m = writes.match(/\(via\s+([^)]+)\)/i);
  if (m) return m[1].trim();
  return writes;
}

export function buildGraph(recipe: Recipe): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  const nodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];

  // Column 0 — trigger
  if (recipe.trigger.kind === "cron") {
    nodes.push({
      id: "trigger", kind: "trigger-cron", x: COL_X[0], y: 80,
      label: "Schedule", config: recipe.trigger.humanLabel,
    });
  } else if (recipe.trigger.kind === "anomaly") {
    nodes.push({
      id: "trigger", kind: "trigger-anomaly", x: COL_X[0], y: 80,
      label: "Anomaly trigger", config: recipe.trigger.thresholdLabel,
    });
  } else {
    nodes.push({
      id: "trigger", kind: "trigger-cron", x: COL_X[0], y: 80,
      label: "Manual", config: recipe.trigger.humanLabel,
    });
  }

  // Column 1 — peec-read nodes (one per reads[])
  const readIds: string[] = [];
  recipe.reads.forEach((r, i) => {
    const id = `read${i}`;
    readIds.push(id);
    const cfg = r.replace(/^Peec\s+·\s+/i, "");
    nodes.push({
      id, kind: "peec-read", x: COL_X[1], y: 80 + i * ROW_GAP,
      label: "Peec · read", config: cfg,
    });
    edges.push({ from: "trigger", to: id });
  });

  // Column 2 — claude-think when writes implies generation
  const writes = recipe.writes;
  const needsThink = /\bdraft\b|\brewrite\b|\bgenerate\b|\bpropose\b|\bbrief\b|\bsummary\b/i.test(writes);
  let upstreamForAction: string;
  if (needsThink) {
    nodes.push({
      id: "think", kind: "claude-think", x: COL_X[2], y: 80,
      label: "Claude · decide", config: "compose + score",
    });
    if (readIds.length === 0) {
      edges.push({ from: "trigger", to: "think" });
    } else {
      readIds.forEach((rid) => edges.push({ from: rid, to: "think" }));
    }
    upstreamForAction = "think";
  } else {
    upstreamForAction = readIds[readIds.length - 1] ?? "trigger";
  }

  // Column 3 — action
  const slug = inferToolSlug(writes);
  nodes.push({
    id: "action",
    kind: "action",
    x: COL_X[3], y: 80,
    label: inferActionLabel(writes),
    config: inferActionConfig(writes),
    toolSlug: slug,
  });
  edges.push({ from: upstreamForAction, to: "action" });

  return { nodes, edges };
}

/** Empty graph for a brand-new patch. */
export function emptyGraph(): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  return {
    nodes: [
      { id: "n1", kind: "trigger-cron", x: COL_X[0], y: 80, label: "Schedule", config: "Daily · 09:00" },
    ],
    edges: [],
  };
}
