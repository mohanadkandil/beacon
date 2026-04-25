"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Recipe } from "@/lib/wire/recipes";
import type { Run } from "@/lib/wire/runs";
import { PatchIcon, CronViz } from "./PatchIcons";
import { ScheduleEditor } from "./ScheduleEditor";

const PIGMENT_DEEP: Record<string, string> = {
  rose: "#B73B4F", peach: "#B5601E", sage: "#4A7A45", mint: "#2F8466",
  lavender: "#6E4FAE", clay: "#7E4F26",
};
const STATUS_COLOR: Record<Run["status"], string> = {
  success: "#2F8466", failed: "#B73B4F", "no-op": "#8E8478", running: "#6E4FAE",
};

export function PatchDetailPanel({
  patch, runs, enabled, onToggle, onRun, onClose, userId, projectId,
}: {
  patch: Recipe | null;
  runs: Run[];
  enabled: boolean;
  onToggle: (next: boolean) => void;
  onRun: () => Promise<void>;
  onClose: () => void;
  userId: string;
  projectId: string | null;
}) {
  const open = !!patch;
  const [running, setRunning] = useState(false);
  const router = useRouter();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!patch) return null;

  const deep = PIGMENT_DEEP[patch.pigment] ?? PIGMENT_DEEP.rose;
  const recentRuns = runs.filter((r) => r.recipeId === patch.id).slice(0, 5);

  const fire = async () => {
    setRunning(true);
    try { await onRun(); }
    finally { setRunning(false); }
  };

  return (
    <>
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, zIndex: 40,
        background: "rgba(26, 22, 18, 0.32)",
        backdropFilter: "blur(2px)",
        opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none",
        transition: "opacity 220ms ease",
      }}/>
      <div className="beacon-sidebar-scroll" style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: 520, maxWidth: "92vw",
        zIndex: 50,
        background: `radial-gradient(360px 220px at 100% 0%, ${deep}1A 0%, transparent 60%), #FAF6EE`,
        boxShadow: "-24px 0 60px rgba(26,22,18,0.18)",
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 280ms cubic-bezier(0.2, 0.7, 0.3, 1)",
        overflowY: "auto",
        fontFamily: '-apple-system, "SF Pro Text", system-ui',
      }}>
        <div style={{
          position: "sticky", top: 0, zIndex: 5,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 22px",
          background: "rgba(250, 246, 238, 0.85)",
          backdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(26,22,18,0.06)",
        }}>
          <div style={{
            fontSize: 10, fontWeight: 800, letterSpacing: "0.26em",
            textTransform: "uppercase", color: deep,
          }}>YAPPR · WIRE · PATCH</div>
          <button onClick={onClose} style={{
            padding: "4px 10px", borderRadius: 999,
            background: "rgba(255,255,255,0.55)",
            border: "1px solid rgba(26,22,18,0.08)",
            color: "#4A413A", fontSize: 11, fontWeight: 700,
            cursor: "pointer",
          }}>esc · close</button>
        </div>

        <div style={{ padding: "26px 28px 32px" }}>
          {/* Hero */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 20 }}>
            <div style={{
              width: 56, height: 56, flex: "none",
              borderRadius: 999,
              background: "#FAF6EE",
              color: deep,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: `0 0 0 2px ${deep}33, 0 0 0 6px ${deep}10`,
            }}>
              <PatchIcon patchId={patch.id} width={28} height={28} />
            </div>
            <div style={{ flex: 1 }}>
              <h1 style={{
                fontFamily: '-apple-system, "SF Pro Display", system-ui',
                fontWeight: 800, fontSize: 28,
                letterSpacing: "-0.02em",
                margin: 0, lineHeight: 1.1, color: "#1A1612",
              }}>{patch.name}</h1>
              <p style={{
                fontFamily: '"New York", Georgia, serif',
                fontSize: 14, lineHeight: 1.55,
                color: "#4A413A",
                margin: "8px 0 0",
              }}>{patch.description}</p>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
            <button onClick={fire} disabled={running || patch.status === "coming_soon"} style={{
              padding: "10px 16px", borderRadius: 999, border: 0,
              background: running ? "#4A413A" : "#1A1612",
              color: running ? "#F4D265" : "#FAF6EE",
              fontSize: 13, fontWeight: 800,
              cursor: running ? "wait" : "pointer",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}>
              {running ? "running…" : patch.status === "coming_soon" ? "coming soon" : "▸ run now"}
            </button>
            <button
              onClick={() => { onClose(); router.push(`/wire/${patch.id}`); }}
              style={{
                padding: "10px 14px", borderRadius: 999, border: "1px solid rgba(26,22,18,0.1)",
                background: "rgba(255,255,255,0.55)", color: "#1A1612",
                fontSize: 13, fontWeight: 700, cursor: "pointer",
              }}
            >open in canvas →</button>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: "#4A413A" }}>
              <button onClick={() => onToggle(!enabled)} aria-label={enabled ? "Disable" : "Enable"}
                      style={{
                        width: 36, height: 20, borderRadius: 999,
                        background: enabled ? deep : "rgba(26,22,18,0.15)",
                        border: 0, padding: 0, cursor: "pointer",
                      }}>
                <span style={{
                  display: "block", width: 14, height: 14, borderRadius: 999,
                  background: "#FAF6EE",
                  transform: enabled ? "translateX(19px)" : "translateX(3px)",
                  transition: "transform 180ms ease-out",
                  marginTop: 3,
                  boxShadow: "0 1px 1px rgba(0,0,0,0.18)",
                }} />
              </button>
              <span style={{ fontWeight: 700 }}>{enabled ? "enabled" : "disabled"}</span>
            </label>
          </div>

          {/* SCHEDULE */}
          <Section title="schedule">
            <ScheduleEditor
              userId={userId}
              patchId={patch.id}
              projectId={projectId}
              deepPigment={deep}
            />
          </Section>

          {/* TRIGGER */}
          <Section title="default trigger (used if no schedule)">
            <div style={{ marginBottom: 8 }}>
              <CronViz cronSpec={"cronSpec" in patch.trigger ? patch.trigger.cronSpec : undefined}
                       kind={patch.trigger.kind}
                       label={patch.trigger.kind === "anomaly" ? patch.trigger.thresholdLabel : patch.trigger.humanLabel} />
            </div>
            {"cronSpec" in patch.trigger && (
              <div style={{
                fontFamily: "ui-monospace, monospace", fontSize: 11,
                color: "#8E8478",
                padding: "4px 10px", borderRadius: 999,
                background: "rgba(26,22,18,0.04)",
                display: "inline-block",
              }}>cron · {patch.trigger.cronSpec}</div>
            )}
          </Section>

          {/* READS */}
          <Section title="reads">
            <ul style={{ margin: 0, paddingLeft: 16, color: "#4A413A", fontSize: 13, lineHeight: 1.6 }}>
              {patch.reads.map((r) => <li key={r}><code style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{r}</code></li>)}
            </ul>
          </Section>

          {/* WRITES */}
          <Section title="writes">
            <code style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#4A413A" }}>{patch.writes}</code>
          </Section>

          {/* REQUIRED ENV */}
          {patch.requiresEnv.length > 0 && (
            <Section title="requires">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {patch.requiresEnv.map((e) => (
                  <span key={e} style={{
                    fontFamily: "ui-monospace, monospace", fontSize: 11,
                    padding: "3px 8px", borderRadius: 6,
                    background: "rgba(26,22,18,0.06)",
                    color: "#1A1612", fontWeight: 700,
                  }}>{e}</span>
                ))}
              </div>
            </Section>
          )}

          {/* CONFIG */}
          {patch.configurable && patch.configurable.length > 0 && (
            <Section title="configurable">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {patch.configurable.map((c) => (
                  <div key={c.key} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 12px", borderRadius: 12,
                    background: "rgba(255,255,255,0.55)",
                    border: "1px solid rgba(26,22,18,0.06)",
                  }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#1A1612" }}>{c.label}</div>
                      <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: "#8E8478", marginTop: 2 }}>{c.key}</div>
                    </div>
                    <code style={{
                      fontFamily: "ui-monospace, monospace", fontSize: 12,
                      padding: "3px 8px", borderRadius: 6,
                      background: "rgba(26,22,18,0.06)", color: "#1A1612",
                    }}>{String(c.default)}</code>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 10, color: "#8E8478", marginTop: 8, fontFamily: '"New York", Georgia, serif', fontStyle: "italic" }}>
                Per-user persistence is on the roadmap — for v0 these are baseline defaults.
              </p>
            </Section>
          )}

          {/* RECENT RUNS */}
          {recentRuns.length > 0 && (
            <Section title="recent runs">
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {recentRuns.map((r) => {
                  const c = STATUS_COLOR[r.status];
                  return (
                    <div key={r.id} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 12px", borderRadius: 12,
                      background: "rgba(255,255,255,0.55)",
                      border: "1px solid rgba(26,22,18,0.06)",
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: 999, background: c, flex: "none" }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: "#1A1612", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.message}
                        </div>
                        <div style={{ fontSize: 10, color: "#8E8478", marginTop: 2 }}>
                          {relTime(r.endedAt ?? r.startedAt)}
                        </div>
                      </div>
                      {r.artifactUrl && (
                        <a href={r.artifactUrl} target="_blank" rel="noreferrer" style={{
                          fontSize: 11, fontWeight: 700, color: deep, textDecoration: "none",
                        }}>{r.artifactLabel ?? "open ↗"}</a>
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>
          )}
        </div>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 22 }}>
      <div style={{
        fontSize: 9, fontWeight: 800,
        letterSpacing: "0.26em", textTransform: "uppercase",
        color: "#8E8478", marginBottom: 8,
      }}>{title}</div>
      {children}
    </section>
  );
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec/60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec/3600)}h ago`;
  return `${Math.floor(sec/86400)}d ago`;
}
