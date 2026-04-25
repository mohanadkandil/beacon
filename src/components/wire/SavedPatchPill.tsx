"use client";

import { useRouter } from "next/navigation";
import type { SavedPatch } from "@/lib/wire/patches-store";

export function SavedPatchPill({ patch }: { patch: SavedPatch }) {
  const router = useRouter();
  const nodeCount = patch.nodes?.length ?? 0;
  const updated = relTime(patch.updatedAt);

  return (
    <article
      onClick={() => router.push(`/wire/${patch.id}`)}
      style={{
        display: "flex", alignItems: "center", gap: 14,
        padding: "12px 14px 12px 16px",
        borderRadius: 999,
        background: "linear-gradient(90deg, rgba(110,79,174,0.08) 0%, transparent 32%), #FAF6EE",
        border: "1px solid rgba(26,22,18,0.06)",
        boxShadow: "0 1px 0 rgba(255,255,255,0.7) inset",
        cursor: "pointer",
        transition: "border-color 160ms",
      }}
    >
      <div style={{
        width: 38, height: 38, flex: "none",
        borderRadius: 999,
        background: "#FAF6EE",
        color: "#6E4FAE",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 0 0 1.5px #6E4FAE33, 0 0 0 4px #6E4FAE10",
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
        </svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <h3 style={{
            fontFamily: '-apple-system, "SF Pro Display", system-ui',
            fontWeight: 800, fontSize: 15.5,
            letterSpacing: "-0.01em",
            color: "#1A1612", margin: 0, lineHeight: 1.2,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>{patch.name}</h3>
          <span style={{
            fontSize: 9, fontWeight: 800,
            letterSpacing: "0.22em", textTransform: "uppercase",
            color: "#6E4FAE",
          }}>SAVED</span>
        </div>
        <p style={{
          margin: "1px 0 0",
          fontFamily: '"New York", Georgia, serif',
          fontSize: 12.5, lineHeight: 1.4,
          color: "#4A413A", fontStyle: "italic",
        }}>
          {nodeCount} node{nodeCount === 1 ? "" : "s"} · {patch.id} · updated {updated}
        </p>
      </div>
      <span style={{
        flex: "none", fontSize: 11, fontWeight: 700,
        color: "#6E4FAE", letterSpacing: "-0.005em",
      }}>open →</span>
    </article>
  );
}

function relTime(t: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec/60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec/3600)}h ago`;
  return `${Math.floor(sec/86400)}d ago`;
}
