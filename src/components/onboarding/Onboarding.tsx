"use client";

import { useState } from "react";
import { Logo } from "@/components/Logo";

type Project = { id: string; name: string; status?: string };

export function Onboarding({ userId, onComplete }: { userId: string; onComplete: (projectId: string, projectName: string) => void }) {
  const [step, setStep] = useState<"key" | "project">("key");
  const [apiKey, setApiKey] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const validateKey = async () => {
    if (!apiKey.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/onboarding/peec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: "validate", apiKey: apiKey.trim() }),
      });
      const d = await r.json();
      if (!d.ok) { setError(d.error || "We couldn't validate that key."); return; }
      const items: Project[] = d.projects ?? [];
      if (!items.length) {
        setError("Key works, but no projects on this account. Create one in Peec first.");
        return;
      }
      setProjects(items);
      setSelectedId(items[0].id);
      setStep("project");
    } finally { setBusy(false); }
  };

  const useDemo = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/onboarding/peec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: "demo" }),
      });
      const d = await r.json();
      if (!d.ok) { setError(d.error || "Demo data isn't configured."); return; }
      const pid = d.project?.id ?? d.projectId;
      const pname = d.project?.name ?? d.projectName ?? "Demo project";
      if (!pid) { setError("Demo response missing project id."); return; }
      onComplete(pid, pname);
    } finally { setBusy(false); }
  };

  const finish = async () => {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      const project = projects.find((p) => p.id === selectedId);
      const r = await fetch("/api/onboarding/peec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId, action: "save",
          apiKey: apiKey.trim(),
          projectId: selectedId,
          projectName: project?.name ?? "",
        }),
      });
      const d = await r.json();
      if (!d.ok) { setError(d.error || "Save failed."); return; }
      onComplete(selectedId, project?.name ?? "");
    } finally { setBusy(false); }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background:
        "radial-gradient(900px 600px at 18% -8%, #FDE3CC 0%, transparent 55%)," +
        "radial-gradient(800px 600px at 100% 110%, #E2DCF3 0%, transparent 55%)," +
        "#FAF6EE",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "32px 24px",
      fontFamily: '-apple-system, "SF Pro Text", system-ui',
    }}>
      <div style={{ width: 460, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 28 }}>
        {/* Top — wordmark + step pills */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Logo size={16} variant="wordmark" />
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{
              width: 6, height: 6, borderRadius: 999,
              background: "#1A1612", opacity: 1,
            }}/>
            <span style={{
              width: 6, height: 6, borderRadius: 999,
              background: "#1A1612",
              opacity: step === "project" ? 1 : 0.18,
              transition: "opacity 220ms",
            }}/>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", color: "#8E8478",
              marginLeft: 4,
            }}>{step === "key" ? "01" : "02"} / 02</span>
          </div>
        </div>

        {/* Hero */}
        <div>
          <h1 style={{
            margin: 0,
            fontFamily: '-apple-system, "SF Pro Display", system-ui',
            fontSize: 36, fontWeight: 800,
            letterSpacing: "-0.028em", lineHeight: 1.05,
            color: "#1A1612",
          }}>
            {step === "key" ? "What's your Peec key?" : "Pick a project."}
          </h1>
          <p style={{
            margin: "8px 0 0",
            fontSize: 14, lineHeight: 1.55, color: "#6B6259",
          }}>
            {step === "key"
              ? "Used to read your brands, citations, and projects from Peec. Stays in your browser."
              : "Switch any time from the top bar — Wire patches will follow."}
          </p>
        </div>

        {/* Body */}
        {step === "key" ? (
          <div>
            <input
              type="password"
              autoFocus
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !busy && apiKey.trim() && validateKey()}
              placeholder="peec_…"
              spellCheck={false}
              style={{
                width: "100%",
                padding: "14px 0 12px",
                background: "transparent",
                border: 0,
                borderBottom: "1.5px solid rgba(26,22,18,0.16)",
                color: "#1A1612",
                fontSize: 18, fontFamily: "ui-monospace, monospace",
                outline: "none",
                letterSpacing: "-0.005em",
              }}
            />
            <p style={{
              margin: "12px 0 0",
              fontSize: 12.5, lineHeight: 1.5, color: "#8E8478",
            }}>
              Find it at{" "}
              <a href="https://app.peec.ai/settings/api" target="_blank" rel="noreferrer"
                 style={{ color: "#6E4FAE", fontWeight: 600, textDecoration: "none", borderBottom: "1px solid rgba(110,79,174,0.3)" }}>
                app.peec.ai → settings → API
              </a>.
            </p>
            <div style={{
              marginTop: 22, display: "flex", alignItems: "center", gap: 10,
            }}>
              <span style={{ height: 1, flex: 1, background: "rgba(26,22,18,0.08)" }}/>
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: "0.22em",
                textTransform: "uppercase", color: "#8E8478",
              }}>or</span>
              <span style={{ height: 1, flex: 1, background: "rgba(26,22,18,0.08)" }}/>
            </div>
            <button
              onClick={useDemo}
              disabled={busy}
              style={{
                marginTop: 16,
                width: "100%",
                padding: "11px 14px", borderRadius: 12,
                background: "rgba(255,255,255,0.55)",
                border: "1px solid rgba(26,22,18,0.1)",
                color: "#1A1612",
                fontSize: 13, fontWeight: 700,
                cursor: busy ? "wait" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                transition: "background 140ms",
              }}
            >
              <span style={{ fontWeight: 700, color: "#1A1612" }}>Try the demo</span>
              <span style={{ color: "#8E8478", fontWeight: 500, fontSize: 11.5 }}>· no key required</span>
            </button>
          </div>
        ) : (
          <div style={{
            display: "flex", flexDirection: "column", gap: 5,
            maxHeight: 280, overflowY: "auto",
            margin: "0 -2px", padding: "0 2px",
          }}>
            {projects.map((p) => {
              const active = p.id === selectedId;
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 11,
                    padding: "12px 14px", borderRadius: 12,
                    background: active ? "rgba(26,22,18,0.05)" : "transparent",
                    border: `1px solid ${active ? "rgba(26,22,18,0.18)" : "rgba(26,22,18,0.06)"}`,
                    color: "#1A1612",
                    fontSize: 14, fontWeight: 600,
                    cursor: "pointer", textAlign: "left",
                    transition: "background 140ms, border-color 140ms",
                  }}
                >
                  <span style={{
                    width: 8, height: 8, borderRadius: 999,
                    background: active ? "#1A1612" : "rgba(26,22,18,0.18)",
                    flex: "none",
                    transition: "background 140ms",
                  }}/>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.name}
                  </span>
                  {p.status && p.status !== "active" && (
                    <span style={{
                      fontSize: 9.5, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase",
                      color: "#8E8478",
                    }}>{p.status}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            padding: "11px 14px", borderRadius: 12,
            background: "rgba(183,59,79,0.06)",
            border: "1px solid rgba(183,59,79,0.18)",
            color: "#B73B4F",
            fontSize: 12.5, lineHeight: 1.45, fontWeight: 500,
          }}>{error}</div>
        )}

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
          {step === "project" ? (
            <button
              onClick={() => { setStep("key"); setError(null); }}
              style={{
                padding: "8px 0", background: "transparent", border: 0,
                color: "#8E8478", fontSize: 12, fontWeight: 600, cursor: "pointer",
                letterSpacing: "-0.005em",
              }}
            >← back</button>
          ) : <span/>}
          <button
            onClick={step === "key" ? validateKey : finish}
            disabled={busy || (step === "key" ? apiKey.trim().length < 8 : !selectedId)}
            style={{
              padding: "11px 20px", borderRadius: 999,
              background: busy ? "#4A413A" : "#1A1612",
              color: busy ? "#F4D265" : "#FAF6EE",
              border: 0,
              fontSize: 13, fontWeight: 700,
              letterSpacing: "-0.005em",
              cursor: busy ? "wait" : ((step === "key" ? apiKey.trim().length >= 8 : !!selectedId) ? "pointer" : "not-allowed"),
              opacity: (step === "key" ? apiKey.trim().length < 8 : !selectedId) ? 0.32 : 1,
              boxShadow: "0 4px 14px rgba(26,22,18,0.14)",
              display: "inline-flex", alignItems: "center", gap: 8,
            }}
          >
            {busy ? "…" : (step === "key" ? "Validate" : "Open Studio")}
            <span style={{ fontWeight: 800 }}>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
