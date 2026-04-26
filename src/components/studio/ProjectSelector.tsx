"use client";

import { useEffect, useRef, useState } from "react";

type Project = { id: string; name: string; status?: string };

export function ProjectSelector({
  activeProjectId, userId, onChange,
}: {
  activeProjectId: string | null;
  userId: string;
  onChange: (project: Project) => void;
}) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetch(`/api/projects?userId=${encodeURIComponent(userId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.ok) setProjects(d.projects);
        else setError(d.error || "failed");
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!open) return;
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const active = projects.find((p) => p.id === activeProjectId);

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-semibold border transition-colors"
        style={{
          background: open ? "rgba(110, 79, 174, 0.12)" : "rgba(255,255,255,0.55)",
          borderColor: open ? "rgba(110, 79, 174, 0.3)" : "rgba(26,22,18,0.08)",
          color: "#1A1612",
        }}
      >
        <span className="w-2 h-2 rounded-full" style={{
          background: "#6E4FAE", boxShadow: "0 0 8px rgba(110,79,174,0.5)",
        }} />
        {loading ? "Loading…" : active?.name ?? "Select project"}
        <svg width="10" height="10" viewBox="0 0 10 10" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 160ms" }}>
          <path d="M2 4l3 3 3-3" stroke="#4A413A" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-[320px] rounded-[16px] overflow-hidden z-50"
          style={{
            background: "#FAF6EE",
            boxShadow: "0 24px 60px rgba(26,22,18,0.18), 0 6px 14px rgba(26,22,18,0.1)",
            border: "1px solid rgba(26,22,18,0.06)",
          }}
        >
          <div className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.22em]" style={{
            color: "#8E8478", borderBottom: "1px solid rgba(26,22,18,0.06)",
          }}>
            Switch project
          </div>
          {error && (
            <div className="px-4 py-3 text-[12px]" style={{ color: "#B73B4F" }}>
              {error}
              <div className="mt-1" style={{ color: "#8E8478" }}>
                Reconnect your Peec key from onboarding, then refresh.
              </div>
            </div>
          )}
          {!error && projects.length === 0 && !loading && (
            <div className="px-4 py-3 text-[12px]" style={{ color: "#8E8478" }}>
              No projects found for this Peec API key.
            </div>
          )}
          {projects.map((p) => {
            const isActive = p.id === activeProjectId;
            return (
              <button
                key={p.id}
                onClick={() => { onChange(p); setOpen(false); }}
                className="w-full text-left px-4 py-3 flex items-center gap-3 transition-colors"
                style={{
                  background: isActive ? "rgba(47, 132, 102, 0.12)" : "transparent",
                  borderBottom: "1px solid rgba(26,22,18,0.04)",
                }}
                onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "rgba(26,22,18,0.04)"; }}
                onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{
                  background: isActive ? "#2F8466" : "#D6CDB8",
                  boxShadow: isActive ? "0 0 8px rgba(47,132,102,0.55)" : "none",
                }} />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[13px] truncate" style={{ color: "#1A1612" }}>{p.name}</div>
                  <div className="font-mono text-[10px] truncate" style={{ color: "#8E8478" }}>{p.id}</div>
                </div>
                {p.status && (
                  <span className="text-[9px] font-bold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full" style={{
                    background: p.status === "TRIAL" ? "#F6E7AC" : "#D6E5C9",
                    color: p.status === "TRIAL" ? "#7E5A0E" : "#4A7A45",
                  }}>{p.status}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
