"use client";

import { useState } from "react";
import type { Recipe } from "@/lib/wire/recipes";
import type { Run } from "@/lib/wire/runs";
import { PatchIcon } from "./PatchIcons";

const PIGMENT_DEEP: Record<string, string> = {
  rose: "#B73B4F", peach: "#B5601E", sage: "#4A7A45", mint: "#2F8466",
  lavender: "#6E4FAE", clay: "#7E4F26",
};

const STATUS_LABEL: Record<string, string> = {
  live: "live", stub: "sketched", coming_soon: "soon",
};
const STATUS_COLOR: Record<string, string> = {
  live: "#2F8466", stub: "#7E5A0E", coming_soon: "#8E8478",
};

export function PatchPill({
  patch, enabled, onToggle, onRun, onOpenDetail, lastRun, connected,
}: {
  patch: Recipe;
  enabled: boolean;
  onToggle: (next: boolean) => void;
  onRun: () => Promise<void>;
  onOpenDetail: () => void;
  lastRun?: Run;
  connected?: boolean;
}) {
  const [running, setRunning] = useState(false);

  const fire = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRunning(true);
    try { await onRun(); }
    finally { setRunning(false); }
  };

  const deep = PIGMENT_DEEP[patch.pigment] ?? PIGMENT_DEEP.rose;
  const isCustom = patch.id.startsWith("p_");
  const isComingSoon = patch.status === "coming_soon";
  const dotColor = STATUS_COLOR[patch.status] ?? "#8E8478";

  return (
    <article
      onClick={onOpenDetail}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "12px 14px 12px 16px",
        borderRadius: 999,
        // Subtle: cream paper with a soft pigment glow on the left edge.
        background:
          `linear-gradient(90deg, ${deep}0F 0%, transparent 32%), #FAF6EE`,
        border: `1px solid ${enabled ? deep + "33" : "rgba(26,22,18,0.06)"}`,
        boxShadow: enabled
          ? `0 1px 0 rgba(255,255,255,0.7) inset, 0 1px 4px ${deep}14`
          : `0 1px 0 rgba(255,255,255,0.7) inset`,
        opacity: isComingSoon ? 0.65 : 1,
        cursor: "pointer",
      }}
    >
      {/* Icon ring */}
      <div style={{
        width: 38, height: 38, flex: "none",
        borderRadius: 999,
        background: "#FAF6EE",
        color: deep,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: `0 0 0 1.5px ${deep}33, 0 0 0 4px ${deep}10`,
      }}>
        <PatchIcon patchId={patch.id} />
      </div>

      {/* Title + tagline */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 1 }}>
          <h3 style={{
            fontFamily: '-apple-system, "SF Pro Display", system-ui',
            fontWeight: 800, fontSize: 15.5,
            letterSpacing: "-0.01em",
            color: "#1A1612", margin: 0, lineHeight: 1.2,
          }}>{patch.name}</h3>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 9, fontWeight: 700,
            letterSpacing: "0.22em", textTransform: "uppercase",
            color: dotColor,
          }}>
            <span style={{
              width: 5, height: 5, borderRadius: 999,
              background: dotColor,
            }} />
            {isCustom ? "custom" : STATUS_LABEL[patch.status]}
          </span>
        </div>
        <p style={{
          margin: 0,
          fontFamily: '"New York", Georgia, serif',
          fontSize: 13, lineHeight: 1.4,
          color: "#4A413A",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          {patch.description}
        </p>
      </div>

      {/* Ready indicator — patch's required tool is connected */}
      {connected && (
        <span style={{
          flex: "none",
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "3px 8px", borderRadius: 999,
          background: "rgba(47, 132, 102, 0.12)",
          border: "1px solid rgba(47, 132, 102, 0.25)",
          color: "#2F8466",
          fontSize: 9, fontWeight: 800,
          letterSpacing: "0.18em", textTransform: "uppercase",
        }}>
          <span style={{ width: 5, height: 5, borderRadius: 999, background: "#2F8466" }}/>
          ready
        </span>
      )}

      {/* Last run */}
      {lastRun && !running && (
        <a
          href={lastRun.artifactUrl ?? undefined}
          target={lastRun.artifactUrl ? "_blank" : undefined}
          rel="noreferrer"
          onClick={(e) => { e.stopPropagation(); if (!lastRun.artifactUrl) e.preventDefault(); }}
          style={{
            flex: "none",
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 11, fontWeight: 600,
            color: "#4A413A",
            textDecoration: "none",
            padding: "5px 10px",
            borderRadius: 999,
            background: "rgba(26,22,18,0.04)",
            border: "1px solid rgba(26,22,18,0.04)",
          }}
        >
          <RunDot status={lastRun.status} />
          <span>{relTime(lastRun.endedAt ?? lastRun.startedAt)}</span>
          {lastRun.artifactUrl && <span style={{ color: deep, fontWeight: 800 }}>↗</span>}
        </a>
      )}

      {/* Toggle */}
      {!isComingSoon && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(!enabled); }}
          aria-label={enabled ? "Disable" : "Enable"}
          style={{
            flex: "none", width: 36, height: 20, borderRadius: 999,
            background: enabled ? deep : "rgba(26,22,18,0.15)",
            border: 0, padding: 0,
            cursor: "pointer",
          }}
        >
          <span style={{
            display: "block", width: 14, height: 14, borderRadius: 999,
            background: "#FAF6EE",
            transform: enabled ? "translateX(19px)" : "translateX(3px)",
            transition: "transform 180ms ease-out",
            marginTop: 3,
            boxShadow: "0 1px 1px rgba(0,0,0,0.18)",
          }} />
        </button>
      )}

      {/* Run */}
      <button
        onClick={fire}
        disabled={running || isComingSoon}
        style={{
          flex: "none",
          padding: "7px 13px",
          borderRadius: 999,
          border: 0,
          background: running ? "#4A413A" : "#1A1612",
          color: running ? "#F4D265" : "#FAF6EE",
          fontFamily: '-apple-system, "SF Pro Text", system-ui',
          fontSize: 11, fontWeight: 800,
          cursor: running || isComingSoon ? "wait" : "pointer",
          opacity: isComingSoon ? 0.4 : 1,
          display: "inline-flex", alignItems: "center", gap: 6,
        }}
      >
        {running ? (
          <>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: "#F4D265" }} />
            running
          </>
        ) : isComingSoon ? "soon" : "▸ run"}
      </button>
    </article>
  );
}

function RunDot({ status }: { status: Run["status"] }) {
  const c = status === "success" ? "#2F8466" : status === "failed" ? "#B73B4F" : status === "no-op" ? "#8E8478" : "#6E4FAE";
  return <span style={{ width: 5, height: 5, borderRadius: 999, background: c }} />;
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec/60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec/3600)}h ago`;
  return `${Math.floor(sec/86400)}d ago`;
}
