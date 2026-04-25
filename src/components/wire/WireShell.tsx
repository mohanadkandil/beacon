"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PatchPill } from "./PatchPill";
import { SavedPatchPill } from "./SavedPatchPill";
import { PulseCard } from "./PulseCard";
import { StatusFeed } from "./StatusFeed";
import { PatchDetailPanel } from "./PatchDetailPanel";
import type { Recipe } from "@/lib/wire/recipes";
import type { Run } from "@/lib/wire/runs";
import type { SavedPatch } from "@/lib/wire/patches-store";

const LS_ENABLED = "beacon.wire.enabled";

function generatePatchId(): string {
  const rand = Array.from({ length: 12 }, () =>
    "0123456789abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 36)]
  ).join("");
  return `p_${rand}`;
}

export function WireShell({ activeProjectId, projectName, userId, connectedTools }: {
  activeProjectId: string | null;
  projectName: string;
  userId: string;
  connectedTools: Set<string>;
}) {
  const [patches, setPatches] = useState<Recipe[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [detailPatchId, setDetailPatchId] = useState<string | null>(null);
  const [showSecondary, setShowSecondary] = useState(false);
  const [savedPatches, setSavedPatches] = useState<SavedPatch[]>([]);
  const router = useRouter();

  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem(LS_ENABLED);
        if (saved) setEnabled(new Set(JSON.parse(saved)));
      } catch {}
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const persistEnabled = useCallback((next: Set<string>) => {
    try { localStorage.setItem(LS_ENABLED, JSON.stringify([...next])); } catch {}
  }, []);

  const loadPatches = useCallback(async () => {
    const qs = userId ? `?userId=${encodeURIComponent(userId)}` : "";
    const r = await fetch(`/api/wire/recipes${qs}`).then((r) => r.json());
    if (r.ok) setPatches(r.recipes);
  }, [userId]);

  const loadSavedPatches = useCallback(async () => {
    if (!userId) return;
    try {
      const r = await fetch(`/api/wire/patches?userId=${encodeURIComponent(userId)}`).then((r) => r.json());
      if (r.ok) setSavedPatches(r.patches ?? []);
    } catch {}
  }, [userId]);

  const loadRuns = useCallback(async () => {
    const r = await fetch("/api/wire/runs").then((r) => r.json());
    if (r.ok) setRuns(r.runs);
  }, []);
  useEffect(() => {
    const id = window.setTimeout(() => {
      Promise.all([loadPatches(), loadRuns(), loadSavedPatches()]).finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(id);
  }, [loadPatches, loadRuns, loadSavedPatches]);

  // Re-pull saved patches when Wire regains focus — handles the case where
  // the user just hit "save" on /wire/[id] and routed back here.
  useEffect(() => {
    if (!userId) return;
    const onFocus = () => loadSavedPatches();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [userId, loadSavedPatches]);


  // Dev/demo fallback: poll while Wire is open. In deployed demos the
  // Cloudflare Worker also hits this endpoint every minute.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch("/api/wire/cron-tick", { method: "POST" }).then((r) => r.json());
        if (cancelled) return;
        if (r.ok && r.fired > 0) loadRuns();
      } catch {}
    };
    const id = setInterval(tick, 30_000);
    // Fire one immediately so first-load demos pick up due schedules
    tick();
    return () => { cancelled = true; clearInterval(id); };
  }, [userId, loadRuns]);



  const onToggle = useCallback((id: string, next: boolean) => {
    setEnabled((cur) => {
      const set = new Set(cur);
      if (next) set.add(id); else set.delete(id);
      persistEnabled(set);
      return set;
    });
  }, [persistEnabled]);

  const onRun = useCallback(async (id: string) => {
    if (!activeProjectId) { toast.error("Pick a project first"); return; }
    const patch = patches.find((p) => p.id === id);
    const tid = toast.loading(`running ${patch?.name ?? id}…`);
    try {
      const res = await fetch(`/api/wire/run/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: activeProjectId, userId }),
      });
      const data = await res.json();
      if (data.ok) {
        const r: Run = data.run;
        if (r.status === "success") toast.success(r.message, { id: tid, duration: 5000, description: r.artifactUrl ? r.artifactLabel : undefined });
        else if (r.status === "failed") toast.error(r.message, { id: tid, description: r.error });
        else toast(r.message, { id: tid });
        loadRuns();
      } else { toast.error(data.error || "Run failed", { id: tid }); }
    } catch (err) { toast.error((err as Error).message, { id: tid }); }
  }, [activeProjectId, patches, loadRuns, userId]);

  const lastRunByPatch = useMemo(() => {
    const m = new Map<string, Run>();
    for (const r of runs) if (!m.has(r.recipeId)) m.set(r.recipeId, r);
    return m;
  }, [runs]);
  const latestRun = runs[0];

  const live = patches.filter((p) => p.status === "live" || p.id.startsWith("p_"));
  const sketched = patches.filter((p) => p.status === "stub" && !p.id.startsWith("p_"));
  const soon = patches.filter((p) => p.status === "coming_soon");
  const secondaryCount = sketched.length + soon.length;

  const detailPatch = detailPatchId ? patches.find((p) => p.id === detailPatchId) ?? null : null;

  return (
    <>
      <div className="grid flex-1 min-h-0" style={{ gridTemplateColumns: "1fr 380px" }}>
        <div className="overflow-y-auto beacon-editor-scroll" style={{ overscrollBehavior: "contain" }}>
          <div style={{ maxWidth: 880, margin: "0 auto", padding: "44px 36px 64px" }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 28, gap: 24 }}>
              <div>
                <div style={{
                  fontSize: 11, fontWeight: 800,
                  letterSpacing: "0.26em", textTransform: "uppercase",
                  color: "#B5601E", marginBottom: 8,
                }}>
                  YAPPR · WIRE · {projectName.toUpperCase()}
                </div>
                <h1 style={{
                  fontFamily: '-apple-system, "SF Pro Display", system-ui',
                  fontWeight: 800, fontSize: 56,
                  lineHeight: 1.02, letterSpacing: "-0.035em",
                  margin: 0, color: "#1A1612",
                }}>Patches.</h1>
                <p style={{
                  fontFamily: '"New York", Georgia, serif',
                  fontSize: 16, lineHeight: 1.5, color: "#4A413A",
                  margin: "10px 0 0", maxWidth: 580,
                }}>
                  Toggle one on. Hit run. Watch a real artifact land — a PR, a Slack post, a Notion page.
                </p>
              </div>
              <div style={{ display: "flex", gap: 8, flex: "none" }}>
                <button
                  onClick={() => router.push(`/wire/${generatePatchId()}`)}
                  className="beacon-keycap"
                  style={{ padding: "11px 17px", fontSize: 13, whiteSpace: "nowrap" }}
                >
                  ✨ + new patch
                </button>
              </div>
            </div>

            {/* PULSE */}
            <PulseCard latest={latestRun} projectName={projectName} />

            {/* SAVED — user-created patches */}
            {savedPatches.length > 0 && (
              <section style={{ marginBottom: 32 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12, paddingLeft: 4 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 999, background: "#6E4FAE", boxShadow: "0 0 8px #6E4FAE" }} />
                  <h2 style={{
                    fontFamily: '-apple-system, "SF Pro Text", system-ui',
                    fontWeight: 800, fontSize: 11,
                    letterSpacing: "0.26em", margin: 0,
                    color: "#1A1612",
                  }}>YOUR PATCHES</h2>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#8E8478" }}>{savedPatches.length}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {savedPatches.map((p) => {
                    const slugs = new Set(
                      (p.nodes ?? []).map((n) => n.toolSlug).filter(Boolean) as string[]
                    );
                    const tool = (["github","slack","notion","linear","gmail"] as const).find((t) => slugs.has(t));
                    const asRecipe: Recipe = {
                      id: p.id,
                      name: p.name,
                      description: `${p.nodes?.length ?? 0} node${(p.nodes?.length ?? 0) === 1 ? "" : "s"} · custom canvas patch`,
                      pigment: "lavender",
                      emoji: "🧩",
                      trigger: { kind: "manual", humanLabel: "manual" },
                      reads: [],
                      writes: "",
                      status: "live",
                      requiresEnv: [],
                      tool,
                    };
                    return (
                      <PatchPill key={p.id} patch={asRecipe}
                        enabled={enabled.has(p.id)}
                        onToggle={(next) => onToggle(p.id, next)}
                        onRun={() => onRun(p.id)}
                        onOpenDetail={() => router.push(`/wire/${p.id}`)}
                        lastRun={lastRunByPatch.get(p.id)}
                        connected={tool ? connectedTools.has(tool) : false} />
                    );
                  })}
                </div>
              </section>
            )}

            {loading && <div style={{ fontSize: 14, color: "#4A413A" }}>Loading patches…</div>}

            {/* LIVE — primary surface */}
            {live.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
                {live.map((p) => (
                  <PatchPill key={p.id} patch={p}
                    enabled={enabled.has(p.id)}
                    onToggle={(next) => onToggle(p.id, next)}
                    onRun={() => onRun(p.id)}
                    onOpenDetail={() => setDetailPatchId(p.id)}
                    lastRun={lastRunByPatch.get(p.id)}
                    connected={p.tool ? connectedTools.has(p.tool) : false} />
                ))}
              </div>
            )}

            {/* Secondary toggle */}
            {secondaryCount > 0 && (
              <button
                onClick={() => setShowSecondary((s) => !s)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "6px 12px", borderRadius: 999,
                  background: "transparent",
                  border: "1px solid rgba(26,22,18,0.1)",
                  color: "#8E8478",
                  fontSize: 11, fontWeight: 700, cursor: "pointer",
                  marginBottom: 18,
                }}
              >
                {showSecondary ? "hide" : "show"} {secondaryCount} more · sketched + on the bench
                <span style={{ transform: showSecondary ? "rotate(180deg)" : "none", transition: "transform 160ms" }}>▾</span>
              </button>
            )}

            {/* SECONDARY — collapsed by default */}
            {showSecondary && (
              <>
                {sketched.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
                    {sketched.map((p) => (
                      <PatchPill key={p.id} patch={p}
                        enabled={enabled.has(p.id)}
                        onToggle={(next) => onToggle(p.id, next)}
                        onRun={() => onRun(p.id)}
                        onOpenDetail={() => setDetailPatchId(p.id)}
                        lastRun={lastRunByPatch.get(p.id)}
                    connected={p.tool ? connectedTools.has(p.tool) : false} />
                    ))}
                  </div>
                )}
                {soon.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {soon.map((p) => (
                      <PatchPill key={p.id} patch={p}
                        enabled={enabled.has(p.id)}
                        onToggle={(next) => onToggle(p.id, next)}
                        onRun={() => onRun(p.id)}
                        onOpenDetail={() => setDetailPatchId(p.id)}
                        lastRun={lastRunByPatch.get(p.id)}
                    connected={p.tool ? connectedTools.has(p.tool) : false} />
                    ))}
                  </div>
                )}
              </>
            )}

          </div>
        </div>

        <StatusFeed runs={runs} onRefresh={loadRuns} />
      </div>

      <PatchDetailPanel
        patch={detailPatch}
        runs={runs}
        enabled={detailPatchId ? enabled.has(detailPatchId) : false}
        onToggle={(next) => detailPatchId && onToggle(detailPatchId, next)}
        onRun={() => detailPatchId ? onRun(detailPatchId) : Promise.resolve()}
        onClose={() => setDetailPatchId(null)}
        userId={userId}
        projectId={activeProjectId}
      />
    </>
  );
}
