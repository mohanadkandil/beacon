"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { SchedulePreset } from "@/lib/wire/scheduler";

const PRESETS: { value: SchedulePreset; label: string; sub: string }[] = [
  { value: "off",           label: "off",            sub: "no auto-runs" },
  { value: "every-1-min",   label: "every minute",   sub: "demo speed" },
  { value: "every-5-min",   label: "every 5 min",    sub: "fast" },
  { value: "every-15-min",  label: "every 15 min",   sub: "" },
  { value: "every-1-hour",  label: "hourly",         sub: "" },
  { value: "every-6-hours", label: "every 6 hours",  sub: "" },
  { value: "every-1-day",   label: "daily",          sub: "morning" },
  { value: "weekly-mon",    label: "weekly",         sub: "Mondays" },
];

export function ScheduleEditor({
  userId, patchId, projectId, deepPigment,
}: {
  userId: string;
  patchId: string;
  projectId: string | null;
  deepPigment: string;
}) {
  const [preset, setPreset] = useState<SchedulePreset>("off");
  const [nextFiring, setNextFiring] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId) return;
    fetch(`/api/wire/schedule?userId=${encodeURIComponent(userId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) return;
        const mine = (d.schedules ?? []).find((s: { patchId: string }) => s.patchId === patchId);
        if (mine) {
          setPreset(mine.preset);
          setNextFiring(mine.nextFiringAt);
        }
      })
      .catch(() => {});
  }, [userId, patchId]);

  const choose = async (next: SchedulePreset) => {
    if (!projectId) { toast.error("Pick a project first"); return; }
    setSaving(true);
    setPreset(next);
    try {
      const r = await fetch("/api/wire/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, patchId, preset: next, projectId }),
      });
      const d = await r.json();
      if (d.ok) {
        setNextFiring(d.schedule?.nextFiringAt ?? null);
        if (next === "off") toast(`Schedule cleared`);
        else toast.success(`Scheduled: ${d.schedule.presetLabel}`, {
          description: nextFiring && isFinite(d.schedule.nextFiringAt) ? `Next run ${relTime(d.schedule.nextFiringAt)}` : undefined,
        });
      }
    } catch (err) { toast.error((err as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {PRESETS.map((p) => {
          const active = preset === p.value;
          return (
            <button
              key={p.value}
              onClick={() => !saving && choose(p.value)}
              disabled={saving}
              style={{
                display: "inline-flex", flexDirection: "column", alignItems: "flex-start",
                padding: "7px 11px",
                borderRadius: 12,
                background: active ? `${deepPigment}1F` : "rgba(255,255,255,0.55)",
                border: `1px solid ${active ? deepPigment + "55" : "rgba(26,22,18,0.06)"}`,
                color: active ? deepPigment : "#1A1612",
                fontSize: 11.5, fontWeight: 700,
                cursor: saving ? "wait" : "pointer",
                lineHeight: 1.2,
                gap: 1,
              }}
            >
              <span>{p.label}</span>
              {p.sub && <span style={{ fontSize: 9, opacity: 0.7, fontWeight: 600 }}>{p.sub}</span>}
            </button>
          );
        })}
      </div>
      {preset !== "off" && nextFiring && isFinite(nextFiring) && (
        <div style={{
          fontFamily: '"New York", Georgia, serif',
          fontStyle: "italic", fontSize: 12,
          color: "#4A413A", paddingLeft: 4,
        }}>
          next run {relTime(nextFiring)} · Cloudflare Worker ticks every minute when deployed
        </div>
      )}
      {preset === "off" && (
        <div style={{
          fontFamily: '"New York", Georgia, serif',
          fontStyle: "italic", fontSize: 12,
          color: "#8E8478", paddingLeft: 4,
        }}>
          run-now button stays on the pill — no auto-runs scheduled.
        </div>
      )}
    </div>
  );
}

function relTime(t: number): string {
  const sec = Math.round((t - Date.now()) / 1000);
  if (sec <= 0) return "imminent";
  if (sec < 60) return `in ${sec}s`;
  if (sec < 3600) return `in ${Math.round(sec/60)}m`;
  if (sec < 86400) return `in ${Math.round(sec/3600)}h`;
  return `in ${Math.round(sec/86400)}d`;
}
