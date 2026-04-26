"use client";

import { useState } from "react";

type Project = { id: string; name: string; status?: string };
type Summary = { brands: number; topics: number; activeModels: number };
type Step = "choice" | "key" | "project" | "ready";

export function Onboarding({
  userId,
  onComplete,
}: {
  userId: string;
  onComplete: (projectId: string, projectName: string) => void;
}) {
  const [step, setStep] = useState<Step>("choice");
  const [apiKey, setApiKey] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [selectedName, setSelectedName] = useState<string>("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"demo" | "key" | "save" | null>(null);

  const startDemo = async () => {
    setBusy("demo");
    setError(null);
    try {
      const r = await fetch("/api/onboarding/peec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: "demo" }),
      });
      const d = await r.json();
      if (!d.ok) {
        setError(d.error || "Demo project is not available right now.");
        return;
      }
      setSelectedId(d.project?.id ?? "");
      setSelectedName(d.project?.name ?? "Demo project");
      setSummary(d.summary ?? null);
      setStep("ready");
    } finally {
      setBusy(null);
    }
  };

  const validateKey = async () => {
    if (!apiKey.trim()) return;
    setBusy("key");
    setError(null);
    try {
      const r = await fetch("/api/onboarding/peec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: "validate", apiKey: apiKey.trim() }),
      });
      const d = await r.json();
      if (!d.ok) {
        setError(d.error || "Could not validate key.");
        return;
      }
      const items: Project[] = d.projects ?? [];
      if (!items.length) {
        setError("Key works, but no projects were returned for this account.");
        return;
      }
      setProjects(items);
      setSelectedId(items[0].id);
      setSelectedName(items[0].name);
      setStep("project");
    } finally {
      setBusy(null);
    }
  };

  const finishCustom = async () => {
    if (!selectedId) return;
    setBusy("save");
    setError(null);
    try {
      const project = projects.find((p) => p.id === selectedId);
      const r = await fetch("/api/onboarding/peec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          action: "save",
          apiKey: apiKey.trim(),
          projectId: selectedId,
          projectName: project?.name ?? "",
        }),
      });
      const d = await r.json();
      if (!d.ok) {
        setError(d.error || "Save failed.");
        return;
      }
      setSelectedName(project?.name ?? "Project");
      setSummary(d.summary ?? null);
      setStep("ready");
    } finally {
      setBusy(null);
    }
  };

  const selectedProject = projects.find((p) => p.id === selectedId);
  const readyName = selectedName || selectedProject?.name || "Project";

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background:
        "radial-gradient(800px 500px at 0% 0%, #FDE3CC 0%, transparent 60%)," +
        "radial-gradient(700px 500px at 100% 100%, #E2DCF3 0%, transparent 60%)," +
        "#FAF6EE",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "24px",
    }}>
      <div style={{
        width: 720, maxWidth: "100%",
        background: "rgba(255,255,255,0.58)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(26,22,18,0.06)",
        borderRadius: 24,
        boxShadow: "0 30px 80px rgba(26,22,18,0.12)",
        padding: "36px 40px",
      }}>
        <div style={{
          fontSize: 10, fontWeight: 850, letterSpacing: "0.32em", textTransform: "uppercase",
          color: "#B5601E", marginBottom: 12,
        }}>
          yappr studio
        </div>
        <h1 style={{
          margin: 0,
          fontFamily: '-apple-system, "SF Pro Display", system-ui',
          fontSize: 40, fontWeight: 850, letterSpacing: "-0.02em",
          color: "#1A1612", lineHeight: 1.05,
        }}>
          Start with live Peec data.
          <em style={{
            fontFamily: '"New York", "Iowan Old Style", Georgia, serif',
            fontStyle: "italic", fontWeight: 500, color: "#B73B4F",
          }}>{" "}Your call.</em>
        </h1>
        <p style={{
          margin: "12px 0 26px",
          fontFamily: '"New York", Georgia, serif',
          fontSize: 15, lineHeight: 1.55, color: "#4A413A",
          maxWidth: 610,
        }}>
          {step === "choice"
            ? "Try the product instantly on our demo project, or connect your own Peec API key to load your real projects."
            : step === "key"
              ? "Paste your Peec API key. We use it only to fetch your Peec projects and grounded visibility data."
              : step === "project"
                ? "Pick the Peec project you want Quill, Forge, and Wire to use."
                : "Quill, Forge, and Wire are ready to read from this Peec project."}
        </p>

        {error && <ErrorBox message={error} />}

        {step === "choice" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
            <ChoiceCard
              eyebrow="Fastest path"
              title="Demo project"
              body="Open Studio with our live Peec project. Best for judges, screenshots, and quick exploration."
              cta={busy === "demo" ? "Loading demo..." : "Try demo data"}
              onClick={startDemo}
              disabled={busy !== null}
              accent="#2F8466"
            />
            <ChoiceCard
              eyebrow="Your data"
              title="Use my Peec key"
              body="Load your own projects, brands, topics, and citations. Best for testing yappr on your product."
              cta="Connect key"
              onClick={() => { setError(null); setStep("key"); }}
              disabled={busy !== null}
              accent="#6E4FAE"
            />
          </div>
        )}

        {step === "key" && (
          <>
            <label style={labelStyle}>Peec API key</label>
            <input
              type="password"
              autoFocus
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !busy && apiKey.trim() && validateKey()}
              placeholder="peec_..."
              style={inputStyle}
            />
            <p style={{
              margin: "8px 2px 0",
              fontSize: 11.5, color: "#8E8478",
              fontFamily: '"New York", Georgia, serif', fontStyle: "italic",
            }}>
              Find it at{" "}
              <a href="https://app.peec.ai/settings/api" target="_blank" rel="noreferrer"
                 style={{ color: "#6E4FAE", textDecoration: "underline", textUnderlineOffset: 2 }}>
                app.peec.ai settings API
              </a>. Stored in yappr user config for this browser identity.
            </p>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 28 }}>
              <GhostButton onClick={() => { setError(null); setStep("choice"); }}>Back</GhostButton>
              <PrimaryButton
                onClick={validateKey}
                disabled={busy !== null || apiKey.trim().length < 10}
              >{busy === "key" ? "Validating..." : "Continue"}</PrimaryButton>
            </div>
          </>
        )}

        {step === "project" && (
          <>
            <label style={labelStyle}>Your projects ({projects.length})</label>
            <div style={{
              display: "flex", flexDirection: "column", gap: 6,
              maxHeight: 280, overflowY: "auto",
              padding: 4,
            }}>
              {projects.map((p) => {
                const active = p.id === selectedId;
                return (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedId(p.id); setSelectedName(p.name); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "11px 14px", borderRadius: 12,
                      background: active ? "rgba(110,79,174,0.12)" : "rgba(255,255,255,0.55)",
                      border: `1px solid ${active ? "rgba(110,79,174,0.35)" : "rgba(26,22,18,0.06)"}`,
                      color: "#1A1612",
                      fontSize: 13, fontWeight: 700,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span style={{
                      width: 8, height: 8, borderRadius: 999,
                      background: active ? "#6E4FAE" : "rgba(26,22,18,0.18)",
                      boxShadow: active ? "0 0 6px rgba(110,79,174,0.5)" : "none",
                      flex: "none",
                    }}/>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.name}
                    </span>
                    {p.status && <Pill>{p.status}</Pill>}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24 }}>
              <GhostButton onClick={() => { setStep("key"); setError(null); }}>Back</GhostButton>
              <PrimaryButton onClick={finishCustom} disabled={busy !== null || !selectedId}>
                {busy === "save" ? "Connecting..." : "Use this project"}
              </PrimaryButton>
            </div>
          </>
        )}

        {step === "ready" && (
          <>
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8,
              marginBottom: 18,
            }}>
              <ReadyStat label="Brands" value={summary?.brands ?? 0} />
              <ReadyStat label="Topics" value={summary?.topics ?? 0} />
              <ReadyStat label="Models" value={summary?.activeModels ?? 0} />
            </div>
            <div style={{
              borderRadius: 16,
              border: "1px solid rgba(47,132,102,0.18)",
              background: "rgba(47,132,102,0.08)",
              padding: "14px 16px",
              color: "#2F8466",
              fontSize: 13,
              lineHeight: 1.5,
              fontWeight: 700,
            }}>
              {readyName} is connected. Peec powers the reads; MCP connectors power the actions.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 28 }}>
              <PrimaryButton onClick={() => onComplete(selectedId, readyName)}>Open Studio</PrimaryButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const labelStyle = {
  display: "block",
  fontSize: 10,
  fontWeight: 850,
  letterSpacing: "0.22em",
  textTransform: "uppercase",
  color: "#8E8478",
  marginBottom: 8,
} as const;

const inputStyle = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.85)",
  border: "1px solid rgba(26,22,18,0.08)",
  color: "#1A1612",
  fontSize: 14,
  fontFamily: "ui-monospace, monospace",
  outline: "none",
  boxShadow: "0 1px 2px rgba(26,22,18,0.04) inset",
} as const;

function ChoiceCard({
  eyebrow,
  title,
  body,
  cta,
  onClick,
  disabled,
  accent,
}: {
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
  onClick: () => void;
  disabled?: boolean;
  accent: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        textAlign: "left",
        minHeight: 218,
        borderRadius: 18,
        padding: 20,
        background: "rgba(255,255,255,0.66)",
        border: "1px solid rgba(26,22,18,0.07)",
        boxShadow: "0 14px 34px rgba(26,22,18,0.07)",
        cursor: disabled ? "wait" : "pointer",
        opacity: disabled ? 0.7 : 1,
        color: "#1A1612",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{
        fontSize: 9,
        fontWeight: 850,
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        color: accent,
        marginBottom: 10,
      }}>{eyebrow}</div>
      <div style={{ fontSize: 22, lineHeight: 1.1, fontWeight: 850, marginBottom: 10 }}>{title}</div>
      <div style={{
        fontFamily: '"New York", Georgia, serif',
        color: "#4A413A",
        lineHeight: 1.45,
        fontSize: 14,
      }}>{body}</div>
      <div style={{ flex: 1 }} />
      <div style={{
        marginTop: 18,
        color: accent,
        fontSize: 13,
        fontWeight: 850,
      }}>{cta}</div>
    </button>
  );
}

function PrimaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "10px 20px", borderRadius: 999,
        background: disabled ? "#4A413A" : "#1A1612",
        color: disabled ? "#F4D265" : "#FAF6EE",
        border: 0,
        fontSize: 13, fontWeight: 850,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        boxShadow: "0 6px 18px rgba(26,22,18,0.18)",
      }}
    >{children}</button>
  );
}

function GhostButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 14px", borderRadius: 999,
        background: "rgba(255,255,255,0.55)",
        border: "1px solid rgba(26,22,18,0.08)",
        color: "#4A413A",
        fontSize: 12, fontWeight: 750, cursor: "pointer",
      }}
    >{children}</button>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 850, letterSpacing: "0.18em", textTransform: "uppercase",
      color: "#8E8478",
      padding: "2px 7px", borderRadius: 999,
      background: "rgba(26,22,18,0.04)",
    }}>{children}</span>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div style={{
      margin: "0 0 16px",
      padding: "10px 14px",
      borderRadius: 10,
      background: "rgba(183,59,79,0.08)",
      border: "1px solid rgba(183,59,79,0.18)",
      color: "#B73B4F",
      fontSize: 12.5,
    }}>{message}</div>
  );
}

function ReadyStat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{
      borderRadius: 14,
      background: "rgba(255,255,255,0.68)",
      border: "1px solid rgba(26,22,18,0.06)",
      padding: "12px 10px",
    }}>
      <div style={{ fontSize: 22, fontWeight: 850, color: "#1A1612", lineHeight: 1 }}>{value}</div>
      <div style={{
        marginTop: 5,
        color: "#8E8478",
        fontSize: 9,
        fontWeight: 850,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
      }}>{label}</div>
    </div>
  );
}
