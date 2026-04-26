"use client";

import { useState, useEffect } from "react";

type ForgeResp =
  | { ok: true; html: string; rationale: string; model: string; groundedIn: { competitors: string[]; citedTitles: string[] } }
  | { ok: false; error: string };

export function ForgePanel({
  open, onClose, projectId, projectName, userId, onOpenInQuill,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string | null;
  projectName: string;
  userId: string;
  onOpenInQuill: (html: string) => void;
}) {
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("editorial · confident · specific");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<ForgeResp | null>(null);

  // Esc closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Reset result when panel opens fresh.
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResult(null);
  }, [open]);

  const generate = async () => {
    if (!topic.trim()) return;
    setGenerating(true); setResult(null);
    try {
      const r = await fetch("/api/forge-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, projectId, tone, userId }),
      });
      setResult(await r.json());
    } catch (err) { setResult({ ok: false, error: (err as Error).message }); }
    finally { setGenerating(false); }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 40,
          background: "rgba(26, 22, 18, 0.32)",
          backdropFilter: "blur(2px)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 240ms ease",
        }}
      />
      {/* Panel */}
      <div
        className="beacon-sidebar-scroll"
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0,
          width: 560, maxWidth: "92vw",
          zIndex: 50,
          background: "#FAF6EE",
          backgroundImage:
            "radial-gradient(360px 200px at 100% 0%, #FDE3CC 0%, transparent 70%)," +
            "radial-gradient(420px 280px at 0% 100%, #E2DCF3 0%, transparent 70%)",
          boxShadow: "-24px 0 60px rgba(26,22,18,0.18), -6px 0 14px rgba(26,22,18,0.06)",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 320ms cubic-bezier(0.2, 0.7, 0.3, 1)",
          overflowY: "auto",
          fontFamily: '-apple-system, "SF Pro Text", system-ui',
        }}
      >
        <div className="flex items-center justify-between px-7 py-5 border-b" style={{
          borderColor: "rgba(26,22,18,0.08)",
          background: "rgba(250,246,238,0.85)",
          backdropFilter: "blur(20px)",
          position: "sticky", top: 0, zIndex: 5,
        }}>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.26em]" style={{ color: "#B5601E" }}>
              FORGE · NEW DRAFT
            </div>
            <div className="font-extrabold text-[18px] tracking-tight mt-1" style={{ color: "#1A1612" }}>
              Generate from {projectName}&apos;s Peec data
            </div>
          </div>
          <button onClick={onClose} className="px-2.5 py-1 rounded-full text-[11px] font-bold border" style={{
            borderColor: "rgba(26,22,18,0.1)", background: "rgba(255,255,255,0.55)", color: "#4A413A",
          }}>esc · close</button>
        </div>

        <div className="px-7 py-7">
          <p className="text-[15px] leading-[1.55] mb-6" style={{
            fontFamily: '"New York", "Iowan Old Style", Georgia, serif',
            color: "#4A413A",
          }}>
            Type a topic. Forge pulls competitors and cited URL titles from <strong>{projectName}</strong>, asks an LLM via OpenRouter (structured output), and lands the draft directly in your editor.
          </p>

          <div className="rounded-[20px] p-5 mb-6" style={{
            background: "rgba(255,255,255,0.55)",
            border: "1px solid rgba(26,22,18,0.06)",
            boxShadow: "0 12px 30px rgba(26,22,18,0.06)",
          }}>
            <label className="block mb-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] mb-1.5" style={{ color: "#8E8478" }}>
                TOPIC
              </div>
              <input
                type="text" value={topic} onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. your product vs top competitors"
                className="w-full text-[18px] font-medium px-0 py-2 border-0 outline-none bg-transparent"
                style={{
                  fontFamily: '"New York", Georgia, serif',
                  color: "#1A1612",
                  borderBottom: "2px solid rgba(26,22,18,0.12)",
                }}
                onKeyDown={(e) => { if (e.key === "Enter" && !generating) generate(); }}
                autoFocus
              />
            </label>
            <label className="block mb-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] mb-1.5" style={{ color: "#8E8478" }}>
                TONE
              </div>
              <input
                type="text" value={tone} onChange={(e) => setTone(e.target.value)}
                className="w-full text-[13px] font-medium px-0 py-1.5 border-0 outline-none bg-transparent"
                style={{ color: "#4A413A", borderBottom: "1px solid rgba(26,22,18,0.08)" }}
              />
            </label>
            <button
              onClick={generate}
              disabled={!topic.trim() || generating}
              className="beacon-keycap"
              style={{
                opacity: !topic.trim() && !generating ? 0.45 : 1,
                cursor: !topic.trim() || generating ? "default" : "pointer",
              }}
            >
              {generating ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: "#3B2A0E" }} />
                  Forging…
                </>
              ) : "⚒ Generate · ⌘↵"}
            </button>
          </div>

          {result && result.ok && (
            <div className="rounded-[20px] p-5" style={{
              background: "#FAF6EE",
              border: "1px solid rgba(47, 132, 102, 0.18)",
              boxShadow: "0 12px 30px rgba(26,22,18,0.05)",
            }}>
              <div className="flex items-center justify-between mb-4">
                <div className="text-[10px] font-extrabold uppercase tracking-[0.26em]" style={{ color: "#2F8466" }}>
                  DRAFT READY · {result.model}
                </div>
                <button
                  onClick={() => { onOpenInQuill(result.html); onClose(); }}
                  className="px-3.5 py-2 rounded-full text-[12px] font-extrabold" style={{
                    background: "#1A1612", color: "#FAF6EE",
                  }}>
                  Open in Quill →
                </button>
              </div>
              <p className="text-[12px] italic mb-4 pl-3 py-1" style={{
                fontFamily: '"New York", Georgia, serif',
                color: "#4A413A",
                borderLeft: "2px solid #B5601E",
              }}>{result.rationale}</p>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#8E8478" }}>
                GROUNDED IN: {result.groundedIn.competitors.length} competitors · {result.groundedIn.citedTitles.length} cited titles
              </div>
              <div className="beacon-editor max-h-[40vh] overflow-y-auto pr-2 beacon-sidebar-scroll" dangerouslySetInnerHTML={{ __html: result.html }} />
            </div>
          )}

          {result && !result.ok && (
            <div className="rounded-[14px] p-4 font-mono text-[12px]" style={{
              background: "rgba(251, 218, 218, 0.5)", color: "#B73B4F",
            }}>
              <div className="font-bold uppercase tracking-[0.18em] mb-1">Generation failed</div>
              {result.error}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
