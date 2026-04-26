"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { ToolIcon } from "./PatchIcons";
import { PEEC_READ_TOOLS, PEEC_WRITE_TOOLS } from "@/lib/peec-mcp-catalog";
import { AGENTS, findAgent, type OutputField } from "@/lib/agent-catalog";
import type { CanvasNode, CanvasEdge } from "@/lib/wire/graph-builder";

type NodeKind = CanvasNode["kind"];

type NodeDef = {
  kind: NodeKind;
  label: string;
  pigment: string;
  config: string;
  group: "Triggers" | "Reads" | "Writes" | "Agents" | "Actions";
  icon: { type: "shape"; key: string };
};

const NODE_LIBRARY: NodeDef[] = [
  { kind: "trigger-cron",    label: "Schedule",         pigment: "#6E4FAE", config: "Daily · 09:00",       group: "Triggers", icon: { type: "shape", key: "clock" } },
  { kind: "trigger-anomaly", label: "Anomaly trigger",  pigment: "#B73B4F", config: "≥ 2σ drop",           group: "Triggers", icon: { type: "shape", key: "spike" } },
  { kind: "peec-read",       label: "Peec · read",      pigment: "#B5601E", config: "get_brand_report",    group: "Reads",    icon: { type: "shape", key: "eye" } },
  { kind: "peec-write",      label: "Peec · write",     pigment: "#7E5A0E", config: "create_prompt",       group: "Writes",   icon: { type: "shape", key: "pen" } },
  { kind: "claude-think",    label: "Agent",            pigment: "#7E5A0E", config: "pick an agent ↓",     group: "Agents",   icon: { type: "shape", key: "brain" } },
  { kind: "action",          label: "Action",            pigment: "#2F8466", config: "pick a tool ↓",       group: "Actions",  icon: { type: "shape", key: "bolt" } },
];

const TOOL_OPTIONS: { slug: string; label: string; config: string; pigment: string }[] = [
  { slug: "github", label: "GitHub PR",     config: "Composio · PULLS_CREATE", pigment: "#1A1612" },
  { slug: "slack",  label: "Slack message", config: "Composio · SEND_MESSAGE", pigment: "#6E4FAE" },
  { slug: "notion", label: "Notion page",   config: "Composio · CREATE_PAGE",  pigment: "#7E5A0E" },
  { slug: "linear", label: "Linear issue",  config: "Composio · CREATE_ISSUE", pigment: "#B73B4F" },
  { slug: "gmail",  label: "Gmail draft",   config: "Composio · CREATE_DRAFT", pigment: "#B5601E" },
];

/** Per-tool action sub-options — what specific operation the action performs. */
const TOOL_ACTIONS: Record<string, { value: string; label: string }[]> = {
  github: [
    { value: "Composio · GITHUB_PULLS_CREATE",      label: "Create pull request" },
    { value: "Composio · GITHUB_ISSUES_CREATE",     label: "Create issue" },
    { value: "Composio · GITHUB_REPOS_CREATE_FILE", label: "Commit file" },
  ],
  slack: [
    { value: "Composio · SLACK_SEND_MESSAGE",       label: "Send message to channel" },
    { value: "Composio · SLACK_SEND_DM",            label: "Send direct message" },
    { value: "Composio · SLACK_ADD_REACTION",       label: "Add reaction" },
  ],
  notion: [
    { value: "Composio · NOTION_CREATE_PAGE",       label: "Create page" },
    { value: "Composio · NOTION_UPDATE_PAGE",       label: "Update page" },
    { value: "Composio · NOTION_CREATE_DATABASE_ROW", label: "Add database row" },
  ],
  linear: [
    { value: "Composio · LINEAR_CREATE_ISSUE",      label: "Create issue" },
    { value: "Composio · LINEAR_UPDATE_ISSUE",      label: "Update issue" },
    { value: "Composio · LINEAR_ADD_COMMENT",       label: "Add comment" },
  ],
  gmail: [
    { value: "Composio · GMAIL_CREATE_DRAFT",       label: "Create draft" },
    { value: "Composio · GMAIL_SEND_EMAIL",         label: "Send email" },
  ],
};

function NodeIcon({ def, color }: { def: NodeDef; color: string }) {
  const props = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (def.icon.key) {
    case "clock": return (<svg {...props}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>);
    case "spike": return (<svg {...props}><path d="M3 12h6l3-9 4 18 3-9h2"/></svg>);
    case "eye":   return (<svg {...props}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>);
    case "brain": return (<svg {...props}><path d="M9 4a3 3 0 0 0-3 3v3a3 3 0 0 0-2 3 3 3 0 0 0 2 3v3a3 3 0 0 0 3 3"/><path d="M15 4a3 3 0 0 1 3 3v3a3 3 0 0 1 2 3 3 3 0 0 1-2 3v3a3 3 0 0 1-3 3"/><path d="M12 4v16"/></svg>);
    case "bolt":  return (<svg {...props}><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>);
    case "fork":  return (<svg {...props}><path d="M6 4v6"/><path d="M18 4v6"/><circle cx="6" cy="14" r="2"/><circle cx="18" cy="14" r="2"/><path d="M6 16v3a3 3 0 0 0 3 3h6"/></svg>);
    case "pen":   return (<svg {...props}><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>);
    default: return null;
  }
}

const STATUS_CHIP: Record<string, { bg: string; fg: string; label: string }> = {
  live:        { bg: "rgba(47,132,102,0.15)",  fg: "#2F8466", label: "LIVE" },
  stub:        { bg: "rgba(126,90,14,0.12)",   fg: "#7E5A0E", label: "SKETCHED" },
  coming_soon: { bg: "rgba(26,22,18,0.06)",    fg: "#8E8478", label: "SOON" },
  new:         { bg: "rgba(110,79,174,0.15)",  fg: "#6E4FAE", label: "UNTITLED" },
};

const DRAG_THRESHOLD_PX = 4;

/** Compute new x/y for each node so the graph's bounding box is centered
 * inside the given canvas rect. NODE_WIDTH/HEIGHT roughly approximate the
 * card dimensions — close enough for visual centering, exact pixels not
 * required. Adds 30px of top padding so the graph doesn't kiss the topbar. */
function centerNodes(nodes: CanvasNode[], canvasWidth: number, canvasHeight: number): CanvasNode[] {
  if (!nodes.length) return nodes;
  const NODE_W = 180;
  const NODE_H = 64;
  const minX = Math.min(...nodes.map((n) => n.x));
  const maxX = Math.max(...nodes.map((n) => n.x + NODE_W));
  const minY = Math.min(...nodes.map((n) => n.y));
  const maxY = Math.max(...nodes.map((n) => n.y + NODE_H));
  const graphW = maxX - minX;
  const graphH = maxY - minY;
  const offsetX = Math.max(20, (canvasWidth - graphW) / 2 - minX);
  // Vertical: center but allow up to a max of (canvasHeight/2 - graphH/2) so
  // even a tall graph stays visible. Floor at 30px from the top.
  const offsetY = Math.max(30, (canvasHeight - graphH) / 2 - minY);
  return nodes.map((n) => ({ ...n, x: n.x + offsetX, y: n.y + offsetY }));
}

export function PatchCanvasInline({
  patchId,
  patchName,
  initialNodes, initialEdges,
  mode, status, userId, projectId,
  onBack, onSave,
}: {
  patchId: string;
  patchName: string;
  initialNodes: CanvasNode[];
  initialEdges: CanvasEdge[];
  mode: "new" | "edit";
  status?: string;
  userId?: string;
  projectId?: string;
  onBack: () => void;
  onSave: (nodes: CanvasNode[], edges: CanvasEdge[], name: string) => void;
}) {
  const [nodes, setNodes] = useState<CanvasNode[]>(initialNodes);
  const [edges, setEdges] = useState<CanvasEdge[]>(initialEdges);
  const [name, setName] = useState(patchName);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [selectedEdgeIdx, setSelectedEdgeIdx] = useState<number | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [reasoning, setReasoning] = useState<string[] | null>(null);
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const didCenterRef = useRef(false);
  // For click-vs-drag detection
  const pressStart = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);

  const updateNode = useCallback((id: string, patch: Partial<CanvasNode>) => {
    setNodes((cur) => cur.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }, []);

  const removeNode = useCallback((id: string) => {
    setNodes((cur) => cur.filter((n) => n.id !== id));
    setEdges((cur) => cur.filter((e) => e.from !== id && e.to !== id));
    setSelectedId(null);
  }, []);

  // Esc closes (back), Delete/Backspace removes selected node
  useEffect(() => {
    if (didCenterRef.current || !canvasRef.current) return;
    if (!initialNodes.length) { didCenterRef.current = true; return; }
    const rect = canvasRef.current.getBoundingClientRect();
    setNodes((cur) => centerNodes(cur, rect.width, rect.height));
    didCenterRef.current = true;
  }, [initialNodes.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (e.key === "Escape" && !inField) {
        if (selectedId) setSelectedId(null);
        else onBack();
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId && !inField) {
        e.preventDefault();
        removeNode(selectedId);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedId, onBack, removeNode]);

  // Palette drag
  const onPaletteDragStart = (e: React.DragEvent, kind: NodeKind) => {
    e.dataTransfer.setData("application/x-beacon-node", kind);
  };
  const onCanvasDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const onCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const kind = e.dataTransfer.getData("application/x-beacon-node") as NodeKind;
    if (!kind || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const def = NODE_LIBRARY.find((n) => n.kind === kind);
    if (!def) return;
    const id = `n_${Date.now().toString(36)}`;
    setNodes((cur) => [...cur, {
      id, kind, x: e.clientX - rect.left - 90, y: e.clientY - rect.top - 30,
      label: def.label, config: def.config,
    }]);
    setSelectedId(id);
  };

  // Node mousedown — could be click, drag, or "complete a connection"
  const onNodeMouseDown = (e: React.MouseEvent, id: string) => {
    if (!canvasRef.current) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-tool-pick]") || target.closest("[data-connect-handle]")) return;
    e.stopPropagation();
    if (connectingFrom) {
      if (connectingFrom !== id) {
        setEdges((cur) => {
          const exists = cur.some((edge) => edge.from === connectingFrom && edge.to === id);
          if (exists) return cur;
          return [...cur, { from: connectingFrom, to: id }];
        });
      }
      setConnectingFrom(null);
      setCursor(null);
      return;
    }
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    pressStart.current = { id, x: e.clientX, y: e.clientY, moved: false };
    const rect = canvasRef.current.getBoundingClientRect();
    setDragOffset({ x: e.clientX - rect.left - node.x, y: e.clientY - rect.top - node.y });
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!pressStart.current || !canvasRef.current) return;
      const dx = e.clientX - pressStart.current.x;
      const dy = e.clientY - pressStart.current.y;
      const moved = Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX;
      if (moved && !pressStart.current.moved) {
        pressStart.current.moved = true;
        setDragId(pressStart.current.id);
      }
      if (pressStart.current.moved) {
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left - dragOffset.x;
        const y = e.clientY - rect.top - dragOffset.y;
        const movingId = pressStart.current.id;
        setNodes((cur) => cur.map((n) => (n.id === movingId ? { ...n, x, y } : n)));
      }
    };
    const onUp = () => {
      if (pressStart.current) {
        if (!pressStart.current.moved) {
          // It was a click — select
          setSelectedId(pressStart.current.id);
        }
      }
      pressStart.current = null;
      setDragId(null);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
  }, [dragOffset]);

  const onCanvasMouseDown = (e: React.MouseEvent) => {
    // Click on the canvas background (not on a node) deselects
    if (e.target === canvasRef.current || (e.target as HTMLElement).closest("[data-canvas-bg]")) {
      setSelectedId(null);
    }
  };

  const pickTool = (nodeId: string, tool: typeof TOOL_OPTIONS[number]) => {
    updateNode(nodeId, { toolSlug: tool.slug, label: tool.label, config: tool.config });
  };

  const onGenerate = async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/wire/synthesize-patch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!data.ok) {
        toast.error(`Synthesizer failed: ${data.error || "unknown"}`);
        return;
      }
      const rect = canvasRef.current?.getBoundingClientRect();
      const placed = rect ? centerNodes(data.nodes, rect.width, rect.height) : data.nodes;
      setNodes(placed);
      setEdges(data.edges);
      setSelectedId(null);
      setReasoning((data.reasoning ?? null) as string[] | null);
      setReasoningOpen(true);
      if (data.patchName) setName(data.patchName);
      const reasoningLines: string[] = data.reasoning ?? [];
      const desc = reasoningLines.length
        ? reasoningLines.map((line, i) => `${i + 1}. ${line}`).join("\n") + `\n\n${data.nodes.length} nodes · ${data.edges.length} edges · ${data.model}`
        : `${data.nodes.length} nodes · ${data.edges.length} edges · via ${data.model}`;
      toast.success(`Patch generated: ${data.patchName}`, {
        description: desc,
        duration: 12000,
      });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  const chip = STATUS_CHIP[mode === "new" ? "new" : (status ?? "stub")];
  const selected = selectedId ? nodes.find((n) => n.id === selectedId) : null;

  const runTest = async () => {
    const target = selected?.kind === "claude-think"
      ? selected
      : nodes.find((n) => n.kind === "claude-think");
    if (!target) {
      toast.error("Drop an Agent node onto the canvas first.");
      return;
    }
    if (!target.agentSlug) {
      toast.error("Pick an agent preset (or write a prompt) before testing.");
      return;
    }
    const a = findAgent(target.agentSlug);
    const systemPrompt = (target.prompt ?? a?.systemPrompt ?? "").trim();
    const outputFields = target.outputFieldsJson
      ? (() => { try { return JSON.parse(target.outputFieldsJson!); } catch { return a?.outputFields ?? []; } })()
      : (a?.outputFields ?? []);
    if (!systemPrompt || !outputFields.length) {
      toast.error("Agent is missing a prompt or output fields.");
      return;
    }
    setTesting(true);
    const tid = toast.loading(`Testing ${a?.name ?? "agent"}…`, { description: "Calling OpenRouter with structured outputs" });
    try {
      const res = await fetch("/api/wire/test-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentName: a?.name ?? target.label,
          systemPrompt,
          outputFields,
          nodes,
          edges,
          agentNodeId: target.id,
          userId,
          projectId,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        toast.error("Test failed", { id: tid, description: data.error || "unknown error", duration: 8000 });
        return;
      }
      const execs = (data.executions ?? []) as { node: string; tool: string; ok: boolean; message: string; artifactUrl?: string }[];
      const okExecs = execs.filter((e) => e.ok);
      const failExecs = execs.filter((e) => !e.ok);
      const head = `${a?.name ?? "Agent"} · ran clean`;
      const desc = execs.length
        ? execs.map((e) => `${e.ok ? "✓" : "✗"} ${e.tool} — ${e.message}`).join("\n")
        : "no downstream actions wired — agent ran but nothing was shipped";
      if (failExecs.length && !okExecs.length) {
        toast.error(head, { id: tid, duration: 6000, description: desc });
      } else {
        toast.success(head, { id: tid, duration: 6000, description: desc });
      }
    } catch (err) {
      toast.error((err as Error).message, { id: tid });
    } finally {
      setTesting(false);
    }
  };


  return (
    <div style={{
      position: "fixed", inset: 0,
      display: "flex", flexDirection: "column",
      background: "#FAF6EE",
      backgroundImage:
        "radial-gradient(900px 460px at 0% 0%, #CFEAD9 0%, transparent 55%)," +
        "radial-gradient(800px 540px at 100% 100%, #E2DCF3 0%, transparent 55%)",
      fontFamily: '-apple-system, "SF Pro Text", system-ui',
    }}>
      {/* TOP BAR */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 24px",
        borderBottom: "1px solid rgba(26,22,18,0.08)",
        background: "rgba(250,246,238,0.85)",
        backdropFilter: "blur(20px)",
        flex: "none",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button onClick={onBack} style={{
            padding: "7px 12px", borderRadius: 999,
            border: "1px solid rgba(26,22,18,0.1)",
            background: "rgba(255,255,255,0.55)",
            color: "#4A413A", fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}>← back to wire</button>
          <div style={{
            fontSize: 10, fontWeight: 800,
            letterSpacing: "0.26em", textTransform: "uppercase",
            color: "#B5601E",
          }}>YAPPR · WIRE · {mode === "new" ? "NEW PATCH" : "PATCH"}</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              padding: "4px 10px", borderRadius: 999,
              background: "rgba(255,255,255,0.55)",
              border: "1px solid rgba(26,22,18,0.08)",
              color: "#1A1612",
              fontSize: 12, fontWeight: 700,
              fontFamily: '"New York", Georgia, serif',
              fontStyle: "italic",
              outline: "none", minWidth: 200,
            }}
          />
          <span style={{
            padding: "4px 10px", borderRadius: 999,
            background: chip.bg, color: chip.fg,
            fontSize: 9, fontWeight: 800,
            letterSpacing: "0.18em", textTransform: "uppercase",
          }}>{chip.label}</span>
          {reasoning && reasoning.length > 0 && (
            <button
              onClick={() => setReasoningOpen((o) => !o)}
              title={reasoningOpen ? "Hide reasoning" : "Why this graph?"}
              style={{
                padding: "4px 10px 4px 8px", borderRadius: 999,
                background: reasoningOpen ? "rgba(110,79,174,0.18)" : "rgba(255,255,255,0.55)",
                border: `1px solid ${reasoningOpen ? "rgba(110,79,174,0.35)" : "rgba(26,22,18,0.08)"}`,
                color: reasoningOpen ? "#6E4FAE" : "#4A413A",
                fontSize: 11, fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 5,
              }}
            >
              <span style={{
                width: 5, height: 5, borderRadius: 999,
                background: "#6E4FAE", boxShadow: "0 0 6px rgba(110,79,174,0.5)",
              }}/>
              why this graph?
            </button>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {connectingFrom && (
            <span style={{
              padding: "5px 10px", borderRadius: 999,
              background: "rgba(110,79,174,0.15)", color: "#6E4FAE",
              fontSize: 10, fontWeight: 700,
              fontFamily: "ui-monospace, monospace",
            }}>connecting · click target node · esc to cancel</span>
          )}
          {(selectedId || selectedEdgeIdx !== null) && (
            <span style={{
              padding: "5px 10px", borderRadius: 999,
              background: "rgba(26,22,18,0.06)", color: "#4A413A",
              fontSize: 10, fontWeight: 700,
              fontFamily: "ui-monospace, monospace",
            }}>⌫ {selectedEdgeIdx !== null ? "delete edge" : "delete"}</span>
          )}
          <button
            onClick={runTest}
            disabled={testing}
            style={{
              padding: "7px 14px", borderRadius: 999,
              border: "1px solid rgba(26,22,18,0.1)",
              background: testing ? "rgba(110,79,174,0.15)" : "rgba(255,255,255,0.55)",
              color: testing ? "#6E4FAE" : "#4A413A",
              fontSize: 12, fontWeight: 700,
              cursor: testing ? "wait" : "pointer",
              height: 32,
            }}>{testing ? "running…" : "▸ test run"}</button>
          {userId && (
            <button
              onClick={() => {
                const url = `/api/wire/patches/${patchId}/skill?userId=${encodeURIComponent(userId)}`;
                window.open(url, "_blank", "noopener,noreferrer");
              }}
              title="Export this patch as a Cursor / Claude Code skill"
              style={{
                width: 32, height: 32, borderRadius: 999, padding: 0,
                border: "1px solid rgba(26,22,18,0.1)",
                background: "rgba(255,255,255,0.55)",
                cursor: "pointer",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                transition: "background 140ms",
                flex: "none",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(26,22,18,0.05)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.55)"; }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/cursor.svg" alt="Cursor" width={14} height={14} style={{ display: "block" }}/>
            </button>
          )}
          <button onClick={() => onSave(nodes, edges, name)} style={{
            padding: "7px 14px", borderRadius: 999,
            border: 0, background: "#1A1612", color: "#FAF6EE",
            fontSize: 12, fontWeight: 800, cursor: "pointer",
            boxShadow: "0 4px 14px rgba(26,22,18,0.18)",
            height: 32,
          }}>save patch</button>
        </div>
      </div>

      {/* Reasoning panel — slides down under the topbar when the synthesizer ran */}
      {reasoningOpen && reasoning && reasoning.length > 0 && (
        <div style={{
          padding: "14px 22px 16px",
          borderBottom: "1px solid rgba(26,22,18,0.06)",
          background: "linear-gradient(180deg, rgba(110,79,174,0.06) 0%, rgba(255,255,255,0.0) 100%)",
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8, marginBottom: 8,
          }}>
            <span style={{
              fontSize: 9, fontWeight: 800, letterSpacing: "0.26em", textTransform: "uppercase",
              color: "#6E4FAE",
            }}>Synthesizer reasoning</span>
            <span style={{
              fontFamily: '"New York", Georgia, serif', fontStyle: "italic",
              fontSize: 11, color: "#8E8478",
            }}>why each tool was chosen</span>
            <button
              onClick={() => setReasoningOpen(false)}
              style={{
                marginLeft: "auto",
                padding: "3px 9px", borderRadius: 999,
                background: "transparent",
                border: "1px solid rgba(26,22,18,0.08)",
                color: "#8E8478",
                fontSize: 10, fontWeight: 700, cursor: "pointer",
              }}
            >hide</button>
          </div>
          <ol style={{
            margin: 0, paddingLeft: 20,
            display: "flex", flexDirection: "column", gap: 4,
            color: "#1A1612",
            fontFamily: '"New York", Georgia, serif',
            fontSize: 12.5, lineHeight: 1.5,
          }}>
            {reasoning.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
        </div>
      )}

      {/* BODY */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "224px 1fr", minHeight: 0 }}>
        {/* PALETTE */}
        <aside className="beacon-sidebar-scroll" style={{
          overflowY: "auto", padding: "16px 14px",
          borderRight: "1px solid rgba(26,22,18,0.08)",
          background: "rgba(250,246,238,0.4)",
          display: "flex", flexDirection: "column", gap: 14,
        }}>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.26em", textTransform: "uppercase", color: "#8E8478" }}>
            Drag onto canvas
          </div>
          {(["Triggers", "Reads", "Writes", "Agents", "Actions"] as const).map((group) => {
            const items = NODE_LIBRARY.filter((n) => n.group === group);
            return (
              <div key={group}>
                <div style={{
                  fontSize: 9, fontWeight: 800,
                  letterSpacing: "0.22em", textTransform: "uppercase",
                  color: "#B5601E", marginBottom: 6, paddingLeft: 4,
                }}>{group}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {items.map((n) => (
                    <div
                      key={n.kind}
                      draggable
                      onDragStart={(e) => onPaletteDragStart(e, n.kind)}
                      style={{
                        padding: "8px 10px", borderRadius: 12,
                        display: "flex", alignItems: "center", gap: 8,
                        background: "rgba(255,255,255,0.65)",
                        border: "1px solid rgba(26,22,18,0.05)",
                        cursor: "grab",
                      }}
                    >
                      <span style={{ display: "inline-flex", color: n.pigment, flex: "none" }}>
                        {(n.kind === "peec-read" || n.kind === "peec-write") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src="/peeclogo.png" alt="Peec" width={14} height={14}
                             style={{
                               flex: "none", objectFit: "cover",
                               borderRadius: 4,
                               boxShadow: `0 0 0 1px ${n.pigment}33`,
                             }}/>
                      ) : (
                        <NodeIcon def={n} color={n.pigment} />
                      )}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 11.5, color: "#1A1612" }}>{n.label}</div>
                        <div style={{ fontSize: 9.5, color: "#8E8478" }}>{n.config}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <p style={{
            margin: "8px 4px 0", fontSize: 10, lineHeight: 1.5,
            fontFamily: '"New York", Georgia, serif', fontStyle: "italic",
            color: "#8E8478",
          }}>
            Click a node to select. ⌫ removes it.
          </p>
        </aside>

        {/* CANVAS COLUMN */}
        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
          <div style={{ flex: 1, position: "relative", display: "flex", minHeight: 0 }}>
            {/* canvas */}
            <div
              data-canvas-bg
              ref={canvasRef}
              onMouseDown={onCanvasMouseDown}
              onDragOver={onCanvasDragOver}
              onDrop={onCanvasDrop}
              onMouseMove={(ev) => {
                if (!connectingFrom || !canvasRef.current) return;
                const rect = canvasRef.current.getBoundingClientRect();
                setCursor({ x: ev.clientX - rect.left, y: ev.clientY - rect.top });
              }}
              style={{
                flex: 1, minWidth: 0,
                position: "relative", overflow: "auto",
                background:
                  "repeating-linear-gradient(0deg, rgba(26,22,18,0.04) 0, rgba(26,22,18,0.04) 1px, transparent 1px, transparent 32px)," +
                  "repeating-linear-gradient(90deg, rgba(26,22,18,0.04) 0, rgba(26,22,18,0.04) 1px, transparent 1px, transparent 32px)",
                backgroundColor: "#F5EFE0",
              }}
            >
              {/* Edges */}
              <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
                {edges.map((e, i) => {
                  const a = nodes.find((n) => n.id === e.from);
                  const b = nodes.find((n) => n.id === e.to);
                  if (!a || !b) return null;
                  const x1 = a.x + 170, y1 = a.y + 32, x2 = b.x + 10, y2 = b.y + 32;
                  const cx = (x1 + x2) / 2;
                  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
                  const sel = selectedEdgeIdx === i;
                  return (
                    <g key={i}>
                      <path d={`M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`}
                            stroke="transparent" strokeWidth="16" fill="none"
                            style={{ pointerEvents: "stroke", cursor: "pointer" }}
                            onMouseDown={(ev) => { ev.stopPropagation(); setSelectedEdgeIdx(i); setSelectedId(null); }}/>
                      <path d={`M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`}
                            stroke={sel ? "#B73B4F" : "#B5601E"}
                            strokeWidth={sel ? 2.2 : 1.4}
                            fill="none" opacity={sel ? 0.95 : 0.55}
                            pointerEvents="none"/>
                      {sel && (
                        <g transform={`translate(${mx}, ${my})`} style={{ pointerEvents: "auto", cursor: "pointer" }}
                           onMouseDown={(ev) => {
                             ev.stopPropagation();
                             setEdges((cur) => cur.filter((_, j) => j !== i));
                             setSelectedEdgeIdx(null);
                           }}>
                          <circle r="9" fill="#B73B4F" stroke="#FAF6EE" strokeWidth="2"/>
                          <path d="M -3.5 -3.5 L 3.5 3.5 M 3.5 -3.5 L -3.5 3.5" stroke="#FAF6EE" strokeWidth="2" strokeLinecap="round"/>
                        </g>
                      )}
                    </g>
                  );
                })}
                {connectingFrom && cursor && (() => {
                  const a = nodes.find((n) => n.id === connectingFrom);
                  if (!a) return null;
                  const x1 = a.x + 170, y1 = a.y + 32;
                  const x2 = cursor.x, y2 = cursor.y;
                  const cx = (x1 + x2) / 2;
                  return (
                    <path d={`M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`}
                          stroke="#6E4FAE" strokeWidth="1.6" strokeDasharray="6 4"
                          fill="none" opacity="0.85" pointerEvents="none"/>
                  );
                })()}
              </svg>

              {/* Nodes */}
              {nodes.map((n) => {
                const def = NODE_LIBRARY.find((d) => d.kind === n.kind);
                const pigment = n.kind === "action" && n.toolSlug
                  ? (TOOL_OPTIONS.find((t) => t.slug === n.toolSlug)?.pigment ?? def?.pigment ?? "#B73B4F")
                  : (def?.pigment ?? "#B73B4F");
                const isUnconfiguredAction = n.kind === "action" && !n.toolSlug;
                const isSelected = selectedId === n.id;
                return (
                  <div
                    key={n.id}
                    onMouseDown={(e) => onNodeMouseDown(e, n.id)}
                    onMouseEnter={() => setHoveredNodeId(n.id)}
                    onMouseLeave={() => setHoveredNodeId((cur) => (cur === n.id ? null : cur))}
                    style={{
                      position: "absolute",
                      left: n.x, top: n.y, width: isUnconfiguredAction ? 200 : 180,
                      background: "#FAF6EE",
                      borderRadius: 12,
                      padding: "9px 11px",
                      cursor: "grab", userSelect: "none",
                      boxShadow: isSelected
                        ? `0 12px 32px rgba(26,22,18,0.16), 0 0 0 3px ${pigment}, 0 0 0 6px ${pigment}33`
                        : dragId === n.id
                          ? `0 16px 36px rgba(26,22,18,0.18), 0 0 0 2px ${pigment}88`
                          : `0 2px 8px rgba(26,22,18,0.06), 0 0 0 1px ${pigment}33`,
                      zIndex: dragId === n.id || isSelected ? 20 : 5,
                      transition: dragId === n.id ? "none" : "box-shadow 140ms",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      {n.kind === "action" && n.toolSlug ? (
                        <ToolIcon slug={n.toolSlug} width={16} height={16} />
                      ) : (n.kind === "peec-read" || n.kind === "peec-write") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src="/peeclogo.png" alt="Peec" width={14} height={14}
                             style={{
                               flex: "none", objectFit: "cover",
                               borderRadius: 4,
                               boxShadow: `0 0 0 1px ${pigment}33`,
                             }}/>
                      ) : def ? (
                        <span style={{ display: "inline-flex", color: pigment, flex: "none" }}>
                          <NodeIcon def={def} color={pigment} />
                        </span>
                      ) : null}
                      <div style={{ fontWeight: 800, fontSize: 11.5, color: pigment, letterSpacing: "-0.005em" }}>
                        {n.label}
                      </div>
                    </div>
                    {n.config && !isUnconfiguredAction && (
                      <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 9.5, color: "#8E8478", lineHeight: 1.3 }}>
                        {n.config}
                      </div>
                    )}
                    {isUnconfiguredAction && (
                      <div data-tool-pick style={{ marginTop: 6 }}>
                        <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase", color: "#8E8478", marginBottom: 4 }}>pick tool</div>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {TOOL_OPTIONS.map((t) => (
                            <button
                              key={t.slug}
                              onClick={(e) => { e.stopPropagation(); pickTool(n.id, t); }}
                              onMouseDown={(e) => e.stopPropagation()}
                              title={t.label}
                              style={{
                                width: 28, height: 28, borderRadius: 8,
                                display: "inline-flex", alignItems: "center", justifyContent: "center",
                                background: "rgba(255,255,255,0.7)",
                                border: "1px solid rgba(26,22,18,0.08)",
                                cursor: "pointer", padding: 0,
                              }}
                            >
                              <ToolIcon slug={t.slug} width={14} height={14} />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Input port — decorative */}
                    <span style={{
                      position: "absolute", left: -5, top: 24,
                      width: 10, height: 10, borderRadius: 999,
                      background: pigment, border: "2px solid #FAF6EE",
                      pointerEvents: "none",
                    }} />

                    {/* Output port — wide invisible hit zone for dragging out an edge */}
                    <button
                      data-connect-handle
                      title="Drag to connect to another node"
                      onMouseDown={(ev) => {
                        ev.stopPropagation();
                        setConnectingFrom(n.id);
                        setSelectedId(null);
                      }}
                      style={{
                        position: "absolute",
                        right: -16, top: 14,
                        width: 32, height: 32,
                        padding: 0, border: 0,
                        background: "transparent",
                        cursor: "crosshair",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      <span style={{
                        width: connectingFrom === n.id ? 14 : 12,
                        height: connectingFrom === n.id ? 14 : 12,
                        borderRadius: 999,
                        background: connectingFrom === n.id ? pigment : "#FAF6EE",
                        border: `2px solid ${pigment}`,
                        boxShadow: connectingFrom === n.id
                          ? `0 0 0 4px ${pigment}28`
                          : `0 1px 2px rgba(26,22,18,0.18)`,
                        transition: "width 120ms, height 120ms, box-shadow 120ms",
                      }}/>
                    </button>
                  </div>
                );
              })}
            </div>

            {/* PROPERTIES PANEL — slides in when a node is selected */}
            <PropertiesPanel
              selected={selected ?? null}
              onUpdate={(patch) => selected && updateNode(selected.id, patch)}
              onPickTool={(tool) => selected && pickTool(selected.id, tool)}
              onDelete={() => selected && removeNode(selected.id)}
              onClose={() => setSelectedId(null)}
              onConnect={() => {
                if (!selected) return;
                setConnectingFrom(selected.id);
                setSelectedId(null);
              }}
            />



          {/* PROMPT BAR — floating on the canvas, no tray */}
          <div style={{
            position: "absolute",
            bottom: 18, left: 0, right: 0,
            display: "flex", justifyContent: "center",
            padding: "0 16px",
            pointerEvents: "none",
            zIndex: 30,
          }}>
            <div style={{
              pointerEvents: "auto",
              display: "flex", alignItems: "center", gap: 10,
              width: "min(560px, 96%)",
              padding: "9px 9px 9px 18px",
              borderRadius: 999,
              background: "rgba(250, 246, 238, 0.94)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(26,22,18,0.10)",
              boxShadow: "0 18px 40px rgba(26,22,18,0.12), 0 4px 12px rgba(26,22,18,0.06)",
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B5601E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>
                <path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/>
              </svg>
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="describe a patch — when visibility drops 2σ, file Linear + Slack"
                onKeyDown={(e) => { if (e.key === "Enter" && !generating) onGenerate(); }}
                style={{
                  flex: 1, minWidth: 0,
                  border: 0, outline: 0, background: "transparent",
                  fontSize: 13.5, color: "#1A1612",
                  fontFamily: '"New York", "Iowan Old Style", Georgia, serif',
                  fontStyle: prompt ? "normal" : "italic",
                }}
              />
              <button
                onClick={onGenerate}
                disabled={!prompt.trim() || generating}
                style={{
                  flex: "none",
                  padding: "6px 13px", borderRadius: 999, border: 0,
                  background: generating ? "#4A413A" : "#1A1612",
                  color: generating ? "#F4D265" : "#FAF6EE",
                  fontSize: 11.5, fontWeight: 800,
                  cursor: !prompt.trim() ? "default" : "pointer",
                  opacity: !prompt.trim() ? 0.4 : 1,
                  display: "inline-flex", alignItems: "center", gap: 5, height: 28,
                }}
              >
                {generating ? "…" : "generate ⌘↵"}
              </button>
            </div>
          </div>          </div>        </div>
      </div>
    </div>
  );
}

// ============================================================
// PROPERTIES PANEL — slides in when a node is selected
// ============================================================

function PropertiesPanel({
  selected, onUpdate, onPickTool, onDelete, onClose, onConnect,
}: {
  selected: CanvasNode | null;
  onUpdate: (patch: Partial<CanvasNode>) => void;
  onPickTool: (tool: typeof TOOL_OPTIONS[number]) => void;
  onDelete: () => void;
  onClose: () => void;
  onConnect: () => void;
}) {
  const visible = !!selected;
  const def = selected ? NODE_LIBRARY.find((n) => n.kind === selected.kind) : null;

  const pigment = selected?.kind === "action" && selected.toolSlug
    ? (TOOL_OPTIONS.find((t) => t.slug === selected.toolSlug)?.pigment ?? def?.pigment ?? "#B73B4F")
    : (def?.pigment ?? "#B73B4F");

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        flex: "none",
        width: visible ? 320 : 0,
        borderLeft: visible ? "1px solid rgba(26,22,18,0.08)" : "none",
        background: "rgba(250, 246, 238, 0.92)",
        backdropFilter: "blur(20px)",
        overflow: "hidden",
        transition: "width 240ms cubic-bezier(0.2, 0.7, 0.3, 1)",
      }}
    >
      {selected && def && (
        <div className="beacon-sidebar-scroll" style={{ padding: "18px 18px 24px", height: "100%", overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{
              fontSize: 9, fontWeight: 800,
              letterSpacing: "0.26em", textTransform: "uppercase",
              color: pigment,
            }}>NODE · {def.kind.toUpperCase().replace(/-/g, " ")}</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={onConnect} title="Click here, then click another node to wire them" style={{
                padding: "3px 10px", borderRadius: 999,
                border: `1px solid ${pigment}33`,
                background: `${pigment}14`,
                color: pigment, fontSize: 10, fontWeight: 800, cursor: "pointer",
                letterSpacing: "0.04em",
              }}>→ connect</button>
              <button onClick={onClose} style={{
                padding: "3px 9px", borderRadius: 999,
                border: "1px solid rgba(26,22,18,0.08)",
                background: "rgba(255,255,255,0.55)",
                color: "#4A413A", fontSize: 10, fontWeight: 700, cursor: "pointer",
              }}>esc · close</button>
            </div>
          </div>

          {/* Name */}
          <Field label="LABEL">
            <input
              type="text"
              value={selected.label}
              onChange={(e) => onUpdate({ label: e.target.value })}
              style={inputStyle()}
            />
          </Field>

          {/* Config */}
          <Field label="CONFIG">
            <input
              type="text"
              value={selected.config ?? ""}
              onChange={(e) => onUpdate({ config: e.target.value })}
              style={{ ...inputStyle(), fontFamily: "ui-monospace, monospace", fontSize: 12 }}
            />
          </Field>

          {/* Tool selector for action nodes */}
          {selected.kind === "action" && (
            <Field label="TOOL">
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {TOOL_OPTIONS.map((t) => {
                  const active = selected.toolSlug === t.slug;
                  return (
                    <button
                      key={t.slug}
                      onClick={() => onPickTool(t)}
                      title={t.label}
                      style={{
                        padding: "6px 8px", borderRadius: 10,
                        display: "inline-flex", alignItems: "center", gap: 5,
                        background: active ? "#FAF6EE" : "rgba(255,255,255,0.55)",
                        border: `1px solid ${active ? t.pigment + "55" : "rgba(26,22,18,0.06)"}`,
                        color: "#1A1612",
                        fontSize: 11, fontWeight: 700,
                        cursor: "pointer",
                        boxShadow: active ? `0 0 0 1px ${t.pigment}33 inset` : "none",
                      }}
                    >
                      <ToolIcon slug={t.slug} width={14} height={14} />
                      {t.label.split(" ")[0]}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}

          {/* Action sub-operation */}
          {selected.kind === "action" && selected.toolSlug && TOOL_ACTIONS[selected.toolSlug] && (
            <Field label="ACTION">
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {TOOL_ACTIONS[selected.toolSlug].map((opt) => {
                  const active = (selected.config ?? "") === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => onUpdate({ config: opt.value })}
                      style={{
                        padding: "8px 10px", borderRadius: 10,
                        textAlign: "left",
                        background: active ? `${pigment}1A` : "rgba(255,255,255,0.55)",
                        border: `1px solid ${active ? pigment + "44" : "rgba(26,22,18,0.06)"}`,
                        color: "#1A1612",
                        fontSize: 11.5, fontWeight: 700,
                        cursor: "pointer",
                        display: "flex", flexDirection: "column", gap: 2,
                      }}
                    >
                      <span>{opt.label}</span>
                      <code style={{
                        fontFamily: "ui-monospace, monospace", fontSize: 9.5,
                        color: "#8E8478", fontWeight: 500,
                      }}>{opt.value}</code>
                    </button>
                  );
                })}
              </div>
            </Field>
          )}

          {/* Agent picker + editable prompt — for claude-think nodes */}
          {selected.kind === "claude-think" && (
            <>
              <Field label="AGENT">
                <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 280, overflowY: "auto" }}>
                  {AGENTS.map((a) => {
                    const active = selected.agentSlug === a.slug;
                    return (
                      <button
                        key={a.slug}
                        onClick={() => onUpdate({
                          agentSlug: a.slug,
                          label: a.name,
                          config: a.slug,
                          prompt: selected.agentSlug === a.slug ? selected.prompt : a.systemPrompt,
                        })}
                        style={{
                          padding: "9px 11px", borderRadius: 10,
                          textAlign: "left",
                          background: active ? `#${a.pigment}1A` : "rgba(255,255,255,0.55)",
                          border: `1px solid ${active ? "#" + a.pigment + "55" : "rgba(26,22,18,0.06)"}`,
                          color: "#1A1612",
                          fontSize: 11.5, fontWeight: 700,
                          cursor: "pointer",
                          display: "flex", flexDirection: "column", gap: 3,
                        }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <span style={{
                            width: 8, height: 8, borderRadius: 999,
                            background: `#${a.pigment}`,
                            boxShadow: `0 0 6px #${a.pigment}55`,
                          }} />
                          {a.name}
                        </span>
                        <span style={{
                          fontFamily: '"New York", Georgia, serif',
                          fontStyle: "italic", fontSize: 10.5,
                          color: "#8E8478", fontWeight: 500,
                          whiteSpace: "normal", lineHeight: 1.4,
                        }}>{a.description}</span>
                      </button>
                    );
                  })}
                </div>
              </Field>

              {selected.agentSlug && (() => {
                const a = findAgent(selected.agentSlug);
                if (!a) return null;
                const isCustom = (selected.prompt ?? a.systemPrompt) !== a.systemPrompt;
                return (
                  <>
                    <Field label="EXPECTS">
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {a.inputs.map((i) => (
                          <span key={i} style={{
                            padding: "3px 8px", borderRadius: 999,
                            background: "rgba(26,22,18,0.05)",
                            fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                            color: "#4A413A",
                            fontFamily: "ui-monospace, monospace",
                          }}>{i}</span>
                        ))}
                      </div>
                    </Field>
                    <Field label="OUTPUT FIELDS">
                      <OutputFieldsEditor
                        agentDefault={a.outputFields}
                        currentJson={selected.outputFieldsJson}
                        onChange={(json) => onUpdate({ outputFieldsJson: json })}
                      />
                    </Field>
                    <Field label={`SYSTEM PROMPT${isCustom ? "  ·  edited" : ""}`}>
                      <textarea
                        value={selected.prompt ?? a.systemPrompt}
                        onChange={(e) => onUpdate({ prompt: e.target.value })}
                        rows={14}
                        spellCheck={false}
                        style={{
                          width: "100%", minHeight: 220,
                          padding: "10px 12px", borderRadius: 10,
                          background: "rgba(255,255,255,0.7)",
                          border: "1px solid rgba(26,22,18,0.06)",
                          color: "#1A1612",
                          fontSize: 11.5, fontFamily: "ui-monospace, monospace",
                          lineHeight: 1.55,
                          outline: "none", resize: "vertical",
                        }}
                      />
                      {isCustom && (
                        <button
                          onClick={() => onUpdate({ prompt: a.systemPrompt })}
                          style={{
                            marginTop: 6,
                            padding: "4px 10px", borderRadius: 999,
                            background: "rgba(255,255,255,0.55)",
                            border: "1px solid rgba(26,22,18,0.08)",
                            color: "#4A413A",
                            fontSize: 10.5, fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >↺ reset to default</button>
                      )}
                    </Field>
                  </>
                );
              })()}
            </>
          )}

          {/* Peec tool picker — for peec-read / peec-write nodes */}
          {(selected.kind === "peec-read" || selected.kind === "peec-write") && (
            <Field label={selected.kind === "peec-read" ? "PEEC READ TOOL" : "PEEC WRITE TOOL"}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 280, overflowY: "auto" }}>
                {(selected.kind === "peec-read" ? PEEC_READ_TOOLS : PEEC_WRITE_TOOLS).map((t) => {
                  const active = (selected.config ?? "").startsWith(t.slug);
                  return (
                    <button
                      key={t.slug}
                      onClick={() => onUpdate({ config: t.slug, label: `Peec · ${t.label}` })}
                      style={{
                        padding: "8px 10px", borderRadius: 10,
                        textAlign: "left",
                        background: active ? `${pigment}1A` : "rgba(255,255,255,0.55)",
                        border: `1px solid ${active ? pigment + "44" : "rgba(26,22,18,0.06)"}`,
                        color: "#1A1612",
                        fontSize: 11.5, fontWeight: 700,
                        cursor: "pointer",
                        display: "flex", flexDirection: "column", gap: 2,
                      }}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {t.label}
                        {t.destructive && (
                          <span style={{
                            fontSize: 8.5, fontWeight: 800, letterSpacing: "0.2em",
                            color: "#B73B4F", textTransform: "uppercase",
                          }}>destructive</span>
                        )}
                      </span>
                      <span style={{
                        fontFamily: '"New York", Georgia, serif',
                        fontStyle: "italic", fontSize: 10.5,
                        color: "#8E8478", fontWeight: 500,
                        whiteSpace: "normal", lineHeight: 1.35,
                      }}>{t.description}</span>
                      <code style={{
                        fontFamily: "ui-monospace, monospace", fontSize: 9.5,
                        color: "#8E8478", fontWeight: 500,
                      }}>{t.slug}</code>
                    </button>
                  );
                })}
              </div>
            </Field>
          )}

          {/* Cron presets for trigger-cron */}
          {selected.kind === "trigger-cron" && (
            <Field label="QUICK SCHEDULE">
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {[
                  { label: "every minute",    config: "Every minute · demo speed" },
                  { label: "hourly",           config: "Hourly · 09:00" },
                  { label: "daily 9am",        config: "Daily · 09:00" },
                  { label: "Mondays 8am",      config: "Mondays · 08:00" },
                ].map((s) => (
                  <button key={s.label}
                          onClick={() => onUpdate({ config: s.config })}
                          style={{
                            padding: "5px 10px", borderRadius: 999,
                            background: "rgba(255,255,255,0.55)",
                            border: "1px solid rgba(26,22,18,0.06)",
                            color: "#1A1612",
                            fontSize: 10.5, fontWeight: 700,
                            cursor: "pointer",
                          }}>{s.label}</button>
                ))}
              </div>
            </Field>
          )}

          {/* Position readout */}
          <Field label="POSITION">
            <code style={{
              fontFamily: "ui-monospace, monospace", fontSize: 11,
              color: "#8E8478",
            }}>x: {Math.round(selected.x)} · y: {Math.round(selected.y)}</code>
          </Field>

          {/* Delete */}
          <button onClick={onDelete} style={{
            marginTop: 18,
            width: "100%",
            padding: "10px 14px", borderRadius: 12,
            background: "rgba(183, 59, 79, 0.08)",
            border: "1px solid rgba(183, 59, 79, 0.22)",
            color: "#B73B4F",
            fontSize: 12, fontWeight: 800,
            cursor: "pointer",
          }}>⌫ delete node</button>
        </div>
      )}
    </div>
  );
}

function OutputFieldsEditor({
  agentDefault, currentJson, onChange,
}: {
  agentDefault: OutputField[];
  currentJson?: string;
  onChange: (json: string | undefined) => void;
}) {
  const fields: OutputField[] = (() => {
    if (!currentJson) return agentDefault;
    try { return JSON.parse(currentJson) as OutputField[]; }
    catch { return agentDefault; }
  })();
  const isCustom = !!currentJson;

  const commit = (next: OutputField[]) => {
    // Compare to default — if identical, drop the override entirely.
    const sameAsDefault = JSON.stringify(next) === JSON.stringify(agentDefault);
    onChange(sameAsDefault ? undefined : JSON.stringify(next));
  };

  const updateField = (i: number, patch: Partial<OutputField>) => {
    commit(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  };
  const removeField = (i: number) => {
    commit(fields.filter((_, idx) => idx !== i));
  };
  const addField = () => {
    commit([...fields, { name: "new_field", type: "string", description: "" }]);
  };

  const TYPES: OutputField["type"][] = ["string", "number", "boolean", "markdown", "string[]", "object[]"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {fields.map((f, i) => (
        <div key={i} style={{
          display: "flex", flexDirection: "column", gap: 5,
          padding: "9px 10px", borderRadius: 10,
          background: "rgba(255,255,255,0.55)",
          border: "1px solid rgba(26,22,18,0.06)",
        }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="text"
              value={f.name}
              onChange={(e) => updateField(i, { name: e.target.value })}
              placeholder="field_name"
              spellCheck={false}
              style={{
                flex: 1, minWidth: 0,
                padding: "5px 8px", borderRadius: 7,
                background: "rgba(255,255,255,0.85)",
                border: "1px solid rgba(26,22,18,0.06)",
                color: "#1A1612",
                fontSize: 11.5, fontFamily: "ui-monospace, monospace", fontWeight: 700,
                outline: "none",
              }}
            />
            <select
              value={f.type}
              onChange={(e) => updateField(i, { type: e.target.value as OutputField["type"] })}
              style={{
                padding: "5px 6px", borderRadius: 7,
                background: "rgba(255,255,255,0.85)",
                border: "1px solid rgba(26,22,18,0.06)",
                color: "#4A413A",
                fontSize: 10.5, fontFamily: "ui-monospace, monospace", fontWeight: 600,
                outline: "none", cursor: "pointer", flex: "none",
              }}
            >
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button
              onClick={() => removeField(i)}
              title="Remove field"
              style={{
                width: 24, height: 24, borderRadius: 7,
                background: "transparent",
                border: "1px solid rgba(26,22,18,0.06)",
                color: "#8E8478", cursor: "pointer",
                fontSize: 14, lineHeight: 1, flex: "none",
                fontWeight: 700,
              }}
            >×</button>
          </div>
          <input
            type="text"
            value={f.description}
            onChange={(e) => updateField(i, { description: e.target.value })}
            placeholder="What this field should contain"
            style={{
              padding: "5px 8px", borderRadius: 7,
              background: "rgba(255,255,255,0.55)",
              border: "1px solid rgba(26,22,18,0.06)",
              color: "#4A413A",
              fontSize: 11, fontFamily: '"New York", Georgia, serif',
              fontStyle: "italic",
              outline: "none",
            }}
          />
        </div>
      ))}
      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={addField}
          style={{
            flex: 1,
            padding: "6px 10px", borderRadius: 8,
            background: "rgba(255,255,255,0.55)",
            border: "1px dashed rgba(26,22,18,0.18)",
            color: "#4A413A",
            fontSize: 11, fontWeight: 700, cursor: "pointer",
          }}
        >+ add field</button>
        {isCustom && (
          <button
            onClick={() => onChange(undefined)}
            style={{
              padding: "6px 10px", borderRadius: 8,
              background: "rgba(255,255,255,0.55)",
              border: "1px solid rgba(26,22,18,0.08)",
              color: "#4A413A",
              fontSize: 10.5, fontWeight: 700, cursor: "pointer",
            }}
          >↺ reset</button>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: 9, fontWeight: 800,
        letterSpacing: "0.26em", textTransform: "uppercase",
        color: "#8E8478", marginBottom: 6,
      }}>{label}</div>
      {children}
    </div>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    width: "100%",
    padding: "8px 11px", borderRadius: 10,
    background: "rgba(255,255,255,0.65)",
    border: "1px solid rgba(26,22,18,0.08)",
    color: "#1A1612",
    fontSize: 12, fontWeight: 600,
    outline: "none",
    fontFamily: '-apple-system, "SF Pro Text", system-ui',
  };
}
