"use client";

import { useEffect } from "react";
import { ConnectionsPanel } from "./ConnectionsPanel";

export function SettingsPanel({
  open, onClose, userId, projectName,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
  projectName: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, zIndex: 40,
        background: "rgba(26, 22, 18, 0.32)",
        backdropFilter: "blur(2px)",
        opacity: open ? 1 : 0,
        pointerEvents: open ? "auto" : "none",
        transition: "opacity 220ms ease",
      }}/>
      <div className="beacon-sidebar-scroll" style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: 520, maxWidth: "92vw",
        zIndex: 50,
        background:
          "radial-gradient(360px 220px at 100% 0%, #E2DCF3 0%, transparent 60%), #FAF6EE",
        boxShadow: "-24px 0 60px rgba(26,22,18,0.18)",
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 280ms cubic-bezier(0.2, 0.7, 0.3, 1)",
        overflowY: "auto",
        fontFamily: '-apple-system, "SF Pro Text", system-ui',
      }}>
        <div style={{
          position: "sticky", top: 0, zIndex: 5,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 24px",
          background: "rgba(250, 246, 238, 0.85)",
          backdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(26,22,18,0.06)",
        }}>
          <div style={{
            fontSize: 10, fontWeight: 800, letterSpacing: "0.26em",
            textTransform: "uppercase", color: "#6E4FAE",
          }}>SETTINGS</div>
          <button onClick={onClose} style={{
            padding: "4px 10px", borderRadius: 999,
            background: "rgba(255,255,255,0.55)",
            border: "1px solid rgba(26,22,18,0.08)",
            color: "#4A413A", fontSize: 11, fontWeight: 700, cursor: "pointer",
          }}>esc · close</button>
        </div>

        <div style={{ padding: "24px 24px 40px" }}>
          <h1 style={{
            fontFamily: '-apple-system, "SF Pro Display", system-ui',
            fontWeight: 800, fontSize: 36, letterSpacing: "-0.025em",
            margin: 0, lineHeight: 1.1, color: "#1A1612",
          }}>
            Settings.
          </h1>
          <p style={{
            fontFamily: '"New York", Georgia, serif',
            fontSize: 15, lineHeight: 1.5,
            color: "#4A413A",
            margin: "8px 0 24px",
          }}>
            Authorize tools once. yappr Wire stays scoped to your identity — no API keys to copy, no webhooks to manage.
          </p>

          {/* Identity card */}
          <Section title="identity">
            <div style={{
              display: "flex", flexDirection: "column", gap: 6,
              padding: "12px 14px", borderRadius: 14,
              background: "rgba(255,255,255,0.55)",
              border: "1px solid rgba(26,22,18,0.06)",
            }}>
              <Row label="Project" value={projectName} />
              <Row label="User ID" value={userId} mono />
            </div>
            <p style={{
              fontFamily: '"New York", Georgia, serif',
              fontStyle: "italic", fontSize: 11.5,
              color: "#8E8478", marginTop: 8,
            }}>
              Generated per browser. Production swaps this for real auth (Clerk / NextAuth / etc.).
            </p>
          </Section>

          <Section title="tool connections">
            <ConnectionsPanel userId={userId} compact />
          </Section>
        </div>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 26 }}>
      <div style={{
        fontSize: 9, fontWeight: 800,
        letterSpacing: "0.26em", textTransform: "uppercase",
        color: "#8E8478", marginBottom: 10, paddingLeft: 4,
      }}>{title}</div>
      {children}
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontSize: 11.5, color: "#8E8478", fontWeight: 600, letterSpacing: "0.04em" }}>
        {label}
      </span>
      <code style={{
        fontFamily: mono ? "ui-monospace, monospace" : '-apple-system, "SF Pro Text", system-ui',
        fontSize: 12, color: "#1A1612", fontWeight: mono ? 500 : 700,
      }}>{value}</code>
    </div>
  );
}
