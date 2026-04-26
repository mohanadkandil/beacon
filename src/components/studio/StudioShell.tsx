"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Toaster, toast } from "sonner";
import { Editor, type EditorHandle } from "./Editor";
import { LintSidebar, type FixPreview } from "./LintSidebar";
import { ProjectSelector } from "./ProjectSelector";
import { ForgePanel } from "./ForgePanel";
import { WireShell } from "@/components/wire/WireShell";
import { SettingsPanel } from "@/components/wire/SettingsPanel";
import { SAMPLE_DOC } from "./sample-doc";
import { buildLintTargetMap } from "./lint-targeting";
import { parseDoc } from "@/lib/parse-doc";
import type { Lint } from "@/lib/lints";

type Counts = { brands: number; topics: number; topicRows: number; urlRows: number };
type AuditResp =
  | { ok: true; lints: Lint[]; counts: Counts; errors: string[]; range: { start: string; end: string }; activeProject: { id: string; name?: string }; docFacts: { h1: string; h2Count: number; hasJsonLd: boolean; hasFAQPattern: boolean; hasComparisonPattern: boolean; mentionedCompetitors: string[]; wordCount: number; claimCount: number } | null }
  | { ok: false; error: string };
type FixResp =
  | { ok: true; target: "h1" | "intro" | "section" | "add-schema-block" | "append-counter"; newHtml: string; rationale: string; model: string }
  | { ok: false; error: string };

const DEBOUNCE_MS = 800;
const LS_PROJECT = "beacon.activeProjectId";
const LS_MODE = "beacon.mode";
const LS_USER = "beacon.userId";

function generateUserId(): string {
  const rand = Array.from({ length: 12 }, () => Math.random().toString(36).slice(2, 5)).join("").slice(0, 14);
  return `beacon_${rand}`;
}

type Mode = "quill" | "wire";

const FIXABLE_KINDS = new Set(["h1_extractability", "jtbd_framing", "schema_gap", "comparison_structure", "competitor_url"]);

export function StudioShell({
  projectName: initialProjectName,
  projectId: initialProjectId,
  userId: initialUserId = "",
}: {
  projectName: string;
  projectId: string | null;
  userId?: string;
}) {
  const [mode, setMode] = useState<Mode>("quill");
  const [userId, setUserId] = useState<string>(initialUserId);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [connectionsCount, setConnectionsCount] = useState<number | null>(null);
  const [connectedTools, setConnectedTools] = useState<Set<string>>(new Set());
  const [activeProjectId, setActiveProjectId] = useState<string | null>(initialProjectId);
  const [activeProjectName, setActiveProjectName] = useState<string>(initialProjectName);
  const [forgeOpen, setForgeOpen] = useState(false);

  const [lints, setLints] = useState<Lint[]>([]);
  const [counts, setCounts] = useState<Counts>({ brands: 0, topics: 0, topicRows: 0, urlRows: 0 });
  const [errors, setErrors] = useState<string[]>([]);
  const [auditing, setAuditing] = useState(false);
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);
  const [docMeta, setDocMeta] = useState<{ wordCount: number; h2Count: number } | null>(null);
  const [editorContent, setEditorContent] = useState<string>(SAMPLE_DOC);
  const [editorKey, setEditorKey] = useState(0);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const editorRef = useRef<EditorHandle>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const savedProject = localStorage.getItem(LS_PROJECT);
      if (savedProject) setActiveProjectId(savedProject);
      const savedMode = localStorage.getItem(LS_MODE) as Mode | null;
      if (savedMode === "wire" || savedMode === "quill") setMode(savedMode);
      let uid = initialUserId || localStorage.getItem(LS_USER);
      if (!uid) { uid = generateUserId(); localStorage.setItem(LS_USER, uid); }
      else if (initialUserId) localStorage.setItem(LS_USER, initialUserId);
      setUserId(uid);
    } catch {
      setUserId(initialUserId || generateUserId());
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [initialUserId]);

  const audit = useCallback(async (html: string, projectIdOverride?: string) => {
    const pid = projectIdOverride ?? activeProjectId;
    if (!pid) return;
    if (inFlight.current) inFlight.current.abort();
    const ctrl = new AbortController();
    inFlight.current = ctrl;
    setAuditing(true);
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html, projectId: pid, userId }),
        signal: ctrl.signal,
      });
      const data: AuditResp = await res.json();
      if (data.ok) {
        setLints(data.lints);
        setCounts(data.counts);
        setErrors(data.errors);
        setRange(data.range);
        if (data.activeProject?.name) setActiveProjectName(data.activeProject.name);
        if (data.docFacts) setDocMeta({ wordCount: data.docFacts.wordCount, h2Count: data.docFacts.h2Count });
      } else { setErrors([data.error]); }
    } catch (err) {
      if ((err as Error).name !== "AbortError") setErrors([(err as Error).message]);
    } finally {
      if (inFlight.current === ctrl) { setAuditing(false); inFlight.current = null; }
    }
  }, [activeProjectId, userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (mode === "quill" && activeProjectId) audit(editorContent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId, mode]);

  // Load Composio connection count for the gear's red dot.
  // Refresh when settings closes (user just connected something).
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetch(`/api/wire/composio/connections?userId=${encodeURIComponent(userId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d.ok) return;
        const list: string[] = d.connections ?? [];
        setConnectionsCount(list.length);
        setConnectedTools(new Set(list));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userId, settingsOpen]);


  const onEditorUpdate = useCallback((html: string) => {
    setEditorContent(html);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => audit(html), DEBOUNCE_MS);
  }, [audit]);

  const onRequestFix = useCallback(async (lint: Lint): Promise<FixPreview> => {
    const html = editorRef.current?.getHTML() ?? "";
    if (!html) throw new Error("Editor isn't ready yet.");
    const res = await fetch("/api/lint-fix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lint, html }),
    });
    const data: FixResp = await res.json();
    if (!data.ok) throw new Error(data.error || "Fix failed");
    const facts = parseDoc(html);
    let oldSpan = "";
    switch (data.target) {
      case "h1": oldSpan = facts.h1 || "(no H1 yet)"; break;
      case "intro": oldSpan = facts.intro || "(no intro yet)"; break;
      case "section": oldSpan = facts.h2s[0] || "(no H2 yet)"; break;
      case "add-schema-block": oldSpan = "(no schema block currently)"; break;
      case "append-counter": oldSpan = "(append a new paragraph at the end of the draft)"; break;
    }
    return { lintId: lint.id, target: data.target, newHtml: data.newHtml, rationale: data.rationale, model: data.model, oldSpan };
  }, []);

  const onApplyFix = useCallback((preview: FixPreview) => {
    if (!editorRef.current) return;
    editorRef.current.applyFix(preview.target, preview.newHtml);
    setLints((prev) => prev.filter((l) => l.id !== preview.lintId));
    toast.success(`${preview.target.toUpperCase()} updated`, {
      description: preview.rationale, duration: 4000,
    });
    audit(editorRef.current.getHTML());
  }, [audit]);

  const onFixAll = useCallback(async () => {
    const fixable = lints.filter((l) => FIXABLE_KINDS.has(l.kind));
    if (!fixable.length) return;
    let applied = 0; let failed = 0;
    for (const lint of fixable) {
      try {
        const preview = await onRequestFix(lint);
        if (!editorRef.current) continue;
        editorRef.current.applyFix(preview.target, preview.newHtml);
        setLints((prev) => prev.filter((l) => l.id !== preview.lintId));
        applied++;
        await new Promise((r) => setTimeout(r, 450));
      } catch (err) {
        failed++;
        toast.error(`Fix failed: ${lint.title}`, { description: (err as Error).message });
      }
    }
    if (applied) toast.success(`Applied ${applied} fix${applied === 1 ? "" : "es"}`, {
      description: failed ? `${failed} failed` : "Re-auditing now…",
    });
    if (editorRef.current) audit(editorRef.current.getHTML());
  }, [lints, onRequestFix, audit]);

  const onProjectChange = useCallback((p: { id: string; name: string }) => {
    setActiveProjectId(p.id);
    setActiveProjectName(p.name);
    try { localStorage.setItem(LS_PROJECT, p.id); } catch {}
    toast(`Switched to ${p.name}`, { description: "Re-auditing draft against the new project's Peec data…" });
  }, []);

  const onModeChange = useCallback((m: Mode) => {
    setMode(m);
    try { localStorage.setItem(LS_MODE, m); } catch {}
  }, []);

  const onForgeOpenInQuill = useCallback((html: string) => {
    setEditorContent(html);
    setEditorKey((k) => k + 1);
    setMode("quill");
    try { localStorage.setItem(LS_MODE, "quill"); } catch {}
    toast.success("Draft opened in Quill", { description: "Auditing now…" });
    setTimeout(() => audit(html), 50);
  }, [audit]);

  const sevCounts = {
    HIGH: lints.filter((l) => l.severity === "HIGH").length,
    MED:  lints.filter((l) => l.severity === "MED").length,
    LOW:  lints.filter((l) => l.severity === "LOW").length,
  };
  const lintTargets = buildLintTargetMap(lints);

  return (
    <main className="text-[#1A1612] flex flex-col" style={{
      height: "100vh",
      background:
        "radial-gradient(800px 380px at 0% 0%, #CFEAD9 0%, transparent 55%)," +
        "radial-gradient(700px 480px at 100% 0%, #FDE3CC 0%, transparent 55%)," +
        "#FAF6EE",
      fontFamily: '-apple-system, "SF Pro Text", system-ui, sans-serif',
    }}>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "#FAF6EE",
            color: "#1A1612",
            border: "1px solid rgba(26,22,18,0.08)",
            boxShadow: "0 24px 60px rgba(26,22,18,0.18), 0 6px 14px rgba(26,22,18,0.06)",
            borderRadius: 16,
            fontFamily: '-apple-system, "SF Pro Text", system-ui',
          },
        }}
      />

      <div className="flex items-center justify-between px-7 py-4 border-b flex-none" style={{
        borderColor: "rgba(26,22,18,0.08)",
        background: "rgba(250,246,238,0.55)",
        backdropFilter: "blur(20px)",
        position: "relative",
        zIndex: 60,
      }}>
        <div className="flex items-center gap-4 text-[13px]" style={{ color: "#4A413A" }}>
          <Link href="/" className="flex items-center gap-2 font-extrabold text-base">
            <span className="inline-block w-[24px] h-[24px] rounded-full" style={{
              background: "radial-gradient(circle at 30% 30%, #7E5A0E, #B5601E 70%)",
              boxShadow: "0 0 14px rgba(255,170,106,0.55), inset 0 1px 0 rgba(255,255,255,0.5)",
            }} />
            yappr
          </Link>
          <div className="flex items-center gap-0.5 rounded-full p-1 ml-2" style={{
            background: "rgba(26,22,18,0.04)",
          }}>
            <ModeTab active={mode === "quill"} onClick={() => onModeChange("quill")} label="Quill" emoji="✎" />
            <ModeTab active={mode === "wire"} onClick={() => onModeChange("wire")} label="Wire" emoji="⚡" />
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {mode === "quill" && (
            <button
              onClick={() => setForgeOpen(true)}
              className="px-3 py-1.5 rounded-full text-[12px] font-bold border inline-flex items-center gap-1.5"
              style={{
                background: "rgba(255,255,255,0.55)",
                borderColor: "rgba(26,22,18,0.08)",
                color: "#1A1612",
              }}
            >
              <span style={{ fontSize: 13 }}>⚒</span> + New from Forge
            </button>
          )}
          {range && mode === "quill" && (
            <span className="px-3 py-1.5 rounded-full text-[12px] font-semibold border" style={{
              color: "#4A413A", borderColor: "rgba(26,22,18,0.08)",
            }}>{range.start} → {range.end}</span>
          )}
          <ProjectSelector activeProjectId={activeProjectId} userId={userId} onChange={onProjectChange} />
          <button
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            style={{
              width: 36, height: 36, borderRadius: 999,
              background: "rgba(255,255,255,0.55)",
              border: "1px solid rgba(26,22,18,0.08)",
              color: "#4A413A",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
              position: "relative",
              flex: "none",
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            {connectionsCount === 0 && (
              <span style={{
                position: "absolute", top: 5, right: 5,
                width: 7, height: 7, borderRadius: 999,
                background: "#B73B4F",
                boxShadow: "0 0 6px rgba(183,59,79,0.6)",
              }}/>
            )}
          </button>
          {mode === "quill" && (
            <button className="px-4 py-2 rounded-full text-[13px] font-bold" style={{
              background: "#1A1612", color: "#FAF6EE",
            }}>Publish to Notion →</button>
          )}
        </div>
      </div>

      {mode === "quill" && !activeProjectId ? (
        <div className="flex-1 min-h-0 flex items-center justify-center px-8">
          <section className="max-w-[660px] rounded-[24px] p-8" style={{
            background: "rgba(255,255,255,0.58)",
            border: "1px solid rgba(26,22,18,0.08)",
            boxShadow: "0 24px 60px rgba(26,22,18,0.08)",
            backdropFilter: "blur(14px)",
          }}>
            <div className="text-[10px] font-extrabold uppercase tracking-[0.26em] mb-3" style={{ color: "#B5601E" }}>
              Peec project required
            </div>
            <h1 className="text-[34px] leading-tight font-extrabold tracking-[-0.02em] mb-3">
              Select your product before writing.
            </h1>
            <p className="text-[15px] leading-[1.6] mb-5" style={{ color: "#4A413A", fontFamily: '"New York", Georgia, serif' }}>
              The editor starts blank and only audits against your own Peec data. Use the project selector in the top bar to pick a project, or set <code>PEEC_PROJECT_ID</code> in <code>.env.local</code> for a default.
            </p>
            <div className="rounded-[16px] p-4 text-[12px] leading-relaxed" style={{
              background: "rgba(26,22,18,0.05)",
              color: "#4A413A",
              border: "1px solid rgba(26,22,18,0.06)",
            }}>
              No sample competitor copy is loaded. Paste your own page draft or generate one from Forge after selecting a Peec project.
            </div>
          </section>
        </div>
      ) : mode === "quill" ? (
        <div className="grid flex-1 min-h-0" style={{ gridTemplateColumns: "1fr 380px" }}>
          <div className="overflow-y-auto beacon-editor-scroll" style={{ overscrollBehavior: "contain" }}>
            <div className="px-20 py-14">
              <div className="text-[11px] font-bold uppercase tracking-[0.26em] mb-3" style={{ color: "#B5601E" }}>
                {new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" }).toUpperCase()} · DRAFT · {activeProjectName.toUpperCase()}
              </div>
              <div
                className="beacon-editor-frame relative"
                data-lint-h1={lintTargets.h1 ?? undefined}
                data-lint-intro={lintTargets.intro ?? undefined}
                data-lint-section={lintTargets.section ?? undefined}
              >
                <Editor key={editorKey} ref={editorRef} initialContent={editorContent} onUpdate={onEditorUpdate} />
              </div>
            </div>
          </div>

          <LintSidebar
            lints={lints} errors={errors} auditing={auditing}
            dataCounts={{ brands: counts.brands, topics: counts.topics, urlRows: counts.urlRows }}
            onRequestFix={onRequestFix}
            onApplyFix={onApplyFix}
            onFixAll={onFixAll}
          />
        </div>
      ) : (
        <WireShell activeProjectId={activeProjectId} projectName={activeProjectName} userId={userId} connectedTools={connectedTools} />
      )}

      <ForgePanel
        open={forgeOpen}
        onClose={() => setForgeOpen(false)}
        projectId={activeProjectId}
        projectName={activeProjectName}
        userId={userId}
        onOpenInQuill={onForgeOpenInQuill}
      />

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        userId={userId}
        projectName={activeProjectName}
      />

      <div className="flex items-center justify-between px-7 py-3 border-t text-[12px] flex-none" style={{
        borderColor: "rgba(26,22,18,0.08)",
        color: "#8E8478",
        background: "rgba(250,246,238,0.55)",
        backdropFilter: "blur(20px)",
      }}>
        <div className="flex items-center gap-3.5">
          {mode === "quill" ? (
            <>
              <Chip color="#B73B4F" label={`${sevCounts.HIGH} high`} />
              <Chip color="#B5601E" label={`${sevCounts.MED} med`} />
              <Chip color="#4A7A45" label={`${sevCounts.LOW} low`} />
            </>
          ) : (
            <span className="font-semibold" style={{ color: "#4A413A" }}>Wire mode · MCP triggers → real artifacts</span>
          )}
        </div>
        <div>
          {mode === "quill" && docMeta ? `${docMeta.wordCount} words · ${docMeta.h2Count} sections · ` : ""}
          {counts.brands} brands · {counts.topics} topics · {counts.urlRows} cited URLs · last 30 days
          {auditing ? " · auditing…" : ""}
        </div>
      </div>
    </main>
  );
}

function ModeTab({ active, onClick, label, emoji }: { active: boolean; onClick: () => void; label: string; emoji: string }) {
  return (
    <button onClick={onClick} className="px-3 py-1.5 rounded-full text-[12px] font-bold inline-flex items-center gap-1.5 transition-all"
      style={{
        background: active ? "#FAF6EE" : "transparent",
        color: active ? "#1A1612" : "#8E8478",
        boxShadow: active ? "0 1px 0 rgba(255,255,255,0.7) inset, 0 2px 6px rgba(0,0,0,0.06)" : "none",
      }}>
      <span style={{ fontSize: 13 }}>{emoji}</span> {label}
    </button>
  );
}

function Chip({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: "#4A413A" }}>
      <span className="w-2 h-2 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
      {label}
    </span>
  );
}
