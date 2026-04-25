"use client";

import type { Run } from "@/lib/wire/runs";

const PIGMENT: Record<Run["status"], { bg: string; fg: string; dot: string; label: string }> = {
  success: { bg: "rgba(207, 234, 217, 0.6)", fg: "#2F8466", dot: "#2F8466", label: "OK" },
  failed:  { bg: "rgba(251, 218, 218, 0.55)", fg: "#B73B4F", dot: "#B73B4F", label: "FAIL" },
  "no-op": { bg: "rgba(214, 229, 201, 0.55)", fg: "#4A7A45", dot: "#8E8478", label: "NO-OP" },
  running: { bg: "rgba(226, 220, 243, 0.6)", fg: "#6E4FAE", dot: "#6E4FAE", label: "RUNNING" },
};

export function StatusFeed({ runs, onRefresh }: { runs: Run[]; onRefresh: () => void }) {
  return (
    <aside className="border-l flex flex-col" style={{
      borderColor: "rgba(26,22,18,0.08)",
      background: "linear-gradient(180deg, rgba(0,0,0,0.015), transparent)",
      height: "calc(100vh - 110px)",
    }}>
      <div className="flex items-center justify-between px-6 pt-6 pb-3" style={{
        background: "rgba(250,246,238,0.85)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(26,22,18,0.06)",
      }}>
        <div>
          <div className="font-extrabold text-[16px] tracking-tight">Run feed</div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] mt-0.5" style={{ color: "#8E8478" }}>
            {runs.length} {runs.length === 1 ? "RUN" : "RUNS"} · IN-MEMORY
          </div>
        </div>
        <button onClick={onRefresh} className="px-2.5 py-1 rounded-full text-[11px] font-bold" style={{
          background: "rgba(255,255,255,0.55)", color: "#4A413A", border: "1px solid rgba(26,22,18,0.08)",
        }}>↻ Refresh</button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pt-4 pb-6 flex flex-col gap-3 beacon-sidebar-scroll" style={{ overscrollBehavior: "contain" }}>
        {runs.length === 0 && (
          <div className="rounded-[18px] p-5 text-[13px]" style={{
            background: "rgba(255,255,255,0.55)",
            border: "1px solid rgba(26,22,18,0.06)",
            color: "#4A413A",
          }}>
            <div className="font-bold mb-1.5" style={{ color: "#1A1612" }}>No runs yet</div>
            <div className="leading-relaxed">
              Hit <strong>▸ Run now</strong> on any recipe to fire it on stage. Cron-scheduled runs will accumulate here once the Cloudflare Worker is deployed.
            </div>
          </div>
        )}
        {runs.map((r) => {
          const p = PIGMENT[r.status];
          return (
            <article key={r.id} className="rounded-[18px] p-3 flex flex-col gap-2" style={{
              background: p.bg,
              border: `1px solid ${p.fg}22`,
            }}>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full flex-none" style={{ background: p.dot, boxShadow: `0 0 8px ${p.dot}` }} />
                {r.recipeEmoji && <span style={{ fontSize: 16 }}>{r.recipeEmoji}</span>}
                <div className="font-extrabold text-[13px] flex-1 truncate" style={{ color: "#1A1612" }}>{r.recipeName}</div>
                <span className="text-[9px] font-extrabold uppercase tracking-[0.22em] px-1.5 py-0.5 rounded-full" style={{
                  background: "rgba(255,255,255,0.6)", color: p.fg,
                }}>{p.label}</span>
              </div>
              <p className="text-[12.5px] leading-snug m-0" style={{ color: "#4A413A" }}>{r.message}</p>
              {r.error && (
                <p className="text-[11px] font-mono leading-snug rounded-[8px] px-2 py-1.5 m-0" style={{
                  background: "rgba(183, 59, 79, 0.08)", color: "#B73B4F",
                }}>{r.error}</p>
              )}
              {r.trace && r.trace.length > 0 && (
                <details>
                  <summary className="text-[10px] uppercase tracking-[0.18em] font-bold cursor-pointer" style={{ color: "#8E8478" }}>
                    trace · {r.trace.length} step{r.trace.length === 1 ? "" : "s"}
                  </summary>
                  <ul className="text-[11px] leading-snug pl-3 list-disc mt-1.5" style={{ color: "#4A413A" }}>
                    {r.trace.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                </details>
              )}
              <div className="flex items-center gap-3 text-[10px]" style={{ color: "#8E8478" }}>
                <span>{relTime(r.endedAt ?? r.startedAt)}</span>
                {r.artifactUrl && (
                  <a href={r.artifactUrl} target="_blank" rel="noreferrer" className="font-extrabold underline" style={{ color: p.fg }}>
                    {r.artifactLabel || "open artifact ↗"}
                  </a>
                )}
                {!r.artifactUrl && r.artifactLabel && (
                  <span className="font-bold" style={{ color: p.fg }}>{r.artifactLabel}</span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </aside>
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
