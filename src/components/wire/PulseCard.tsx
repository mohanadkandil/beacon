"use client";

import type { Run } from "@/lib/wire/runs";
import { PatchIcon } from "./PatchIcons";

const STATUS_PIGMENT: Record<Run["status"], { fg: string; bg: string; bgDeep: string; label: string }> = {
  success: { fg: "#2F8466", bg: "rgba(207, 234, 217, 0.5)", bgDeep: "rgba(47, 132, 102, 0.18)", label: "RAN CLEAN" },
  failed:  { fg: "#B73B4F", bg: "rgba(251, 218, 218, 0.55)", bgDeep: "rgba(183, 59, 79, 0.2)", label: "FAILED" },
  "no-op": { fg: "#7E5A0E", bg: "rgba(246, 231, 172, 0.55)", bgDeep: "rgba(126, 90, 14, 0.18)", label: "NO-OP" },
  running: { fg: "#6E4FAE", bg: "rgba(226, 220, 243, 0.6)", bgDeep: "rgba(110, 79, 174, 0.18)", label: "RUNNING" },
};

export function PulseCard({ latest, projectName }: { latest?: Run; projectName: string }) {
  // No latest run yet → render nothing. The patch list below is enough on its own;
  // a marketing-style empty hero just adds noise.
  if (!latest) return null;
  void projectName;

  const p = STATUS_PIGMENT[latest.status];
  return (
    <div style={{
      position: "relative",
      borderRadius: 28,
      padding: "26px 32px",
      marginBottom: 28,
      background:
        `radial-gradient(560px 280px at 0% 0%, ${p.bgDeep} 0%, transparent 65%),` +
        `radial-gradient(420px 280px at 100% 100%, rgba(255,255,255,0.4) 0%, transparent 70%),` +
        p.bg,
      border: `1px solid ${p.fg}22`,
      boxShadow: `0 14px 40px rgba(26, 22, 18, 0.07), 0 1px 0 rgba(255,255,255,0.6) inset, 0 0 0 1px ${p.fg}12 inset`,
      overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: 24, right: 26,
        width: 10, height: 10, borderRadius: 999,
        background: p.fg,
        boxShadow: `0 0 14px ${p.fg}88`,
        animation: "none",
      }} />

      <div style={{
        fontSize: 10, fontWeight: 800,
        letterSpacing: "0.28em", textTransform: "uppercase",
        color: p.fg, marginBottom: 10,
      }}>
        Pulse · {projectName} · {p.label} · {relTime(latest.endedAt ?? latest.startedAt)}
      </div>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 18 }}>
        <div style={{
          width: 72, height: 72, flex: "none",
          borderRadius: 999,
          background: "#FAF6EE",
          color: p.fg,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: `0 1px 0 rgba(255,255,255,0.7) inset, 0 0 0 2px ${p.fg}33, 0 8px 18px rgba(26,22,18,0.06)`,
        }}>
          <PatchIcon patchId={latest.recipeId} width={32} height={32} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{
            fontFamily: '-apple-system, "SF Pro Display", system-ui',
            fontWeight: 800, fontSize: 28, letterSpacing: "-0.025em",
            margin: 0, lineHeight: 1.15, color: "#1A1612",
          }}>
            {latest.recipeName}
          </h2>
          <p style={{
            margin: "8px 0 12px",
            fontFamily: '"New York", Georgia, serif',
            fontSize: 16, fontStyle: "italic", lineHeight: 1.45,
            color: "#1A1612",
          }}>
            &quot;{latest.message}&quot;
          </p>
          {latest.artifactUrl ? (
            <a href={latest.artifactUrl} target="_blank" rel="noreferrer"
               style={{
                 display: "inline-flex", alignItems: "center", gap: 8,
                 padding: "8px 16px", borderRadius: 999,
                 background: "#1A1612", color: "#FAF6EE",
                 textDecoration: "none",
                 fontFamily: '-apple-system, "SF Pro Text", system-ui',
                 fontSize: 12, fontWeight: 800,
                 boxShadow: "0 6px 14px rgba(26,22,18,0.18)",
               }}>
              {latest.artifactLabel ?? "open artifact"} ↗
            </a>
          ) : latest.artifactLabel ? (
            <span style={{
              display: "inline-block",
              padding: "8px 16px", borderRadius: 999,
              background: "rgba(255, 255, 255, 0.55)",
              color: p.fg,
              fontFamily: '-apple-system, "SF Pro Text", system-ui',
              fontSize: 12, fontWeight: 800,
              border: `1px solid ${p.fg}22`,
            }}>{latest.artifactLabel}</span>
          ) : null}
        </div>
      </div>
    </div>
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
