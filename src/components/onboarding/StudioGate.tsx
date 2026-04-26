"use client";

import { useEffect, useState } from "react";
import { Onboarding } from "./Onboarding";
import { StudioShell } from "@/components/studio/StudioShell";

const LS_USER = "beacon.userId";
const LS_PROJECT = "beacon.activeProjectId";

function generateUserId(): string {
  const rand = Array.from({ length: 12 }, () => Math.random().toString(36).slice(2, 5)).join("").slice(0, 14);
  return `beacon_${rand}`;
}

export function StudioGate() {
  const [phase, setPhase] = useState<"loading" | "onboarding" | "ready">("loading");
  const [userId, setUserId] = useState<string>("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string>("Project");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let uid = "";
      try { uid = localStorage.getItem(LS_USER) || ""; } catch {}
      if (!uid) {
        uid = generateUserId();
        try { localStorage.setItem(LS_USER, uid); } catch {}
      }
      if (cancelled) return;
      setUserId(uid);

      try {
        const r = await fetch(`/api/wire/user-config?userId=${encodeURIComponent(uid)}`);
        const d = await r.json();
        const cfg: Record<string, string> = (d.ok && d.config) || {};
        const hasPeecAccess = !!cfg["peec.apiKey"] || cfg["peec.mode"] === "demo";
        const pid = cfg["peec.projectId"] || "";
        const pname = cfg["peec.projectName"] || "Project";
        if (cancelled) return;
        if (hasPeecAccess && pid) {
          setProjectId(pid);
          setProjectName(pname);
          try { localStorage.setItem(LS_PROJECT, pid); } catch {}
          setPhase("ready");
        } else {
          setPhase("onboarding");
        }
      } catch {
        if (!cancelled) setPhase("onboarding");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (phase === "loading") {
    return (
      <main style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "#FAF6EE",
        fontFamily: '"New York", Georgia, serif',
        color: "#8E8478", fontStyle: "italic", fontSize: 13,
      }}>opening yappr…</main>
    );
  }

  if (phase === "onboarding") {
    return (
      <Onboarding
        userId={userId}
        onComplete={(pid, pname) => {
          setProjectId(pid);
          setProjectName(pname || "Project");
          try { localStorage.setItem(LS_PROJECT, pid); } catch {}
          setPhase("ready");
        }}
      />
    );
  }

  return <StudioShell projectName={projectName} projectId={projectId} userId={userId} />;
}
