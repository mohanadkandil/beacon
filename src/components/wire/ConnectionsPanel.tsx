"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { ToolIcon } from "./PatchIcons";

type ToolDef = {
  slug: string;
  label: string;
  configKey?: string;
  configLabel?: string;
  configPlaceholder?: string;
  configHelp?: string;
};

const TOOLS: ToolDef[] = [
  { slug: "github",  label: "GitHub",
    configKey: "github.repo", configLabel: "target repo",
    configPlaceholder: "owner/repo",
    configHelp: "Where Schema Sweeper opens PRs."
  },
  { slug: "slack",   label: "Slack",
    configKey: "slack.channel", configLabel: "channel",
    configPlaceholder: "#general",
    configHelp: "Where Slack Brief and Citation Watch post."
  },
  { slug: "notion",  label: "Notion",
    configKey: "notion.parentPageId", configLabel: "parent page id",
    configPlaceholder: "32-char page id",
    configHelp: "Where Notion Drafter creates pages."
  },
  { slug: "linear",  label: "Linear",
    configKey: "linear.teamId", configLabel: "team id",
    configPlaceholder: "team uuid",
    configHelp: "Where Linear Triager files issues."
  },
  { slug: "gmail",   label: "Gmail",
    configKey: "gmail.pitchTo", configLabel: "pitch to",
    configPlaceholder: "you@example.com",
    configHelp: "Email address Gmail Pitcher drafts against (use your own for the demo)."
  },
];

export function ConnectionsPanel({ userId, compact = false }: { userId: string; compact?: boolean }) {
  const [connected, setConnected] = useState<Set<string>>(new Set());
  const [config, setConfig] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [slackChannels, setSlackChannels] = useState<Array<{ id: string; name: string; isPrivate: boolean; isMember: boolean }> | null>(null);
  const [slackChannelsErr, setSlackChannelsErr] = useState<string | null>(null);
  const [slackChannelsLoading, setSlackChannelsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const [conRes, cfgRes] = await Promise.all([
        fetch(`/api/wire/composio/connections?userId=${encodeURIComponent(userId)}`).then((r) => r.json()),
        fetch(`/api/wire/user-config?userId=${encodeURIComponent(userId)}`).then((r) => r.json()),
      ]);
      if (conRes.ok) setConnected(new Set((conRes.connections ?? []) as string[]));
      if (cfgRes.ok) setConfig(cfgRes.config ?? {});
    } catch {}
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => {
    const id = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(id);
  }, [refresh]);
  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  // Fetch Slack channels once Slack is connected.
  useEffect(() => {
    if (!userId || !connected.has("slack") || slackChannels !== null || slackChannelsLoading) return;
    const id = window.setTimeout(() => {
      setSlackChannelsLoading(true);
      fetch(`/api/wire/composio/slack-channels?userId=${encodeURIComponent(userId)}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.ok) { setSlackChannels(d.channels ?? []); setSlackChannelsErr(null); }
          else { setSlackChannelsErr(d.error || "couldn't load channels"); setSlackChannels([]); }
        })
        .catch((err) => { setSlackChannelsErr((err as Error).message); setSlackChannels([]); })
        .finally(() => setSlackChannelsLoading(false));
    }, 0);
    return () => window.clearTimeout(id);
  }, [userId, connected, slackChannels, slackChannelsLoading]);

  const connect = async (slug: string) => {
    setPending(slug);
    try {
      const r = await fetch("/api/wire/composio/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolkit: slug, userId }),
      }).then((r) => r.json());
      if (r.ok && r.redirectUrl) {
        window.open(r.redirectUrl, "_blank", "noopener,noreferrer");
        toast(`Authorize ${slug} in the new tab`, { description: "yappr detects when you return.", duration: 5000 });
      } else {
        toast.error(r.error || `Couldn't start ${slug} connection.`);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally { setPending(null); }
  };

  const saveConfig = async (key: string, value: string) => {
    setConfig((cur) => ({ ...cur, [key]: value }));
    try {
      await fetch("/api/wire/user-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, key, value }),
      });
    } catch (err) {
      toast.error(`Save failed: ${(err as Error).message}`);
    }
  };

  return (
    <div style={compact ? { marginBottom: 0 } : {
      borderRadius: 22, padding: "18px 22px", marginBottom: 28,
      background: "rgba(255, 255, 255, 0.5)",
      border: "1px solid rgba(26, 22, 18, 0.06)",
      boxShadow: "0 10px 30px rgba(26, 22, 18, 0.05), 0 1px 0 rgba(255,255,255,0.6) inset",
      backdropFilter: "blur(14px)",
    }}>
      {!compact && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div style={{
              fontSize: 10, fontWeight: 800, letterSpacing: "0.26em",
              textTransform: "uppercase", color: "#6E4FAE", marginBottom: 4,
            }}>Connections · via Composio MCP</div>
            <div style={{ fontSize: 13, color: "#4A413A" }}>
              Authorize once. Tell Beacon where to ship.
            </div>
          </div>
          <button onClick={refresh} style={{
            padding: "5px 11px", borderRadius: 999,
            background: "rgba(255,255,255,0.55)",
            border: "1px solid rgba(26,22,18,0.08)",
            color: "#4A413A", fontSize: 11, fontWeight: 700, cursor: "pointer",
          }}>↻</button>
        </div>
      )}

      {/* Tool rows — chip + inline config when connected */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {TOOLS.map((t) => {
          const isConnected = connected.has(t.slug);
          const isPending = pending === t.slug;
          const value = (t.configKey && config[t.configKey]) || "";
          return (
            <div key={t.slug} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 10px",
              borderRadius: 14,
              background: isConnected ? "rgba(255,255,255,0.55)" : "transparent",
              border: `1px solid ${isConnected ? "rgba(47, 132, 102, 0.2)" : "rgba(26,22,18,0.06)"}`,
              transition: "border-color 200ms",
            }}>
              {/* Chip */}
              <button
                onClick={() => !isConnected && !isPending && connect(t.slug)}
                disabled={isConnected || isPending || loading}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "6px 12px", borderRadius: 999,
                  background: "rgba(250, 246, 238, 0.92)",
                  border: `1px solid ${isConnected ? "rgba(47,132,102,0.3)" : "rgba(26,22,18,0.08)"}`,
                  color: "#1A1612",
                  fontSize: 12.5, fontWeight: 700,
                  cursor: isConnected || isPending || loading ? "default" : "pointer",
                  opacity: loading ? 0.55 : 1,
                  flex: "none",
                  minWidth: 116,
                }}
              >
                <ToolIcon slug={t.slug} width={14} height={14} />
                <span>{t.label}</span>
                <span style={{
                  width: 6, height: 6, borderRadius: 999,
                  background: isConnected ? "#2F8466" : isPending ? "#6E4FAE" : "#D6CDB8",
                  boxShadow: isConnected ? "0 0 6px rgba(47,132,102,0.6)" : isPending ? "0 0 6px rgba(110,79,174,0.5)" : "none",
                  animation: isPending ? "beacon-pulse-tiny 1.4s ease-in-out infinite" : "none",
                }}/>
              </button>

              {/* Inline config — only when connected */}
              {isConnected && t.configKey && (
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 800,
                      letterSpacing: "0.22em", textTransform: "uppercase",
                      color: "#8E8478", flex: "none",
                    }}>{t.configLabel}</span>
                    {t.slug === "slack" ? (
                      <select
                        value={value}
                        disabled={slackChannelsLoading || (slackChannels?.length ?? 0) === 0}
                        onChange={(e) => saveConfig(t.configKey!, e.target.value)}
                        style={{
                          flex: 1, minWidth: 0,
                          padding: "4px 8px", borderRadius: 8,
                          background: "rgba(255,255,255,0.7)",
                          border: "1px solid rgba(26,22,18,0.06)",
                          color: "#1A1612",
                          fontSize: 12, fontFamily: "ui-monospace, monospace",
                          outline: "none", cursor: "pointer",
                        }}
                      >
                        <option value="">
                          {slackChannelsLoading
                            ? "loading channels…"
                            : (slackChannels?.length ?? 0) === 0
                              ? (slackChannelsErr ? "couldn't load — type below" : "no channels found")
                              : "pick a channel…"}
                        </option>
                        {value && !slackChannels?.some((c) => c.id === value || c.name === value) && (
                          <option value={value}>{value} (saved)</option>
                        )}
                        {(slackChannels ?? []).map((c) => (
                          <option key={c.id || c.name} value={c.id || c.name}>
                            {c.name}{c.isPrivate ? " · private" : ""}{!c.isMember ? " · invite bot" : ""}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        defaultValue={value}
                        placeholder={t.configPlaceholder}
                        onBlur={(e) => {
                          const next = e.target.value.trim();
                          if (next !== value) saveConfig(t.configKey!, next);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
                        }}
                        style={{
                          flex: 1, minWidth: 0,
                          padding: "4px 8px", borderRadius: 8,
                          background: "rgba(255,255,255,0.7)",
                          border: "1px solid rgba(26,22,18,0.06)",
                          color: "#1A1612",
                          fontSize: 12, fontFamily: "ui-monospace, monospace",
                          outline: "none",
                        }}
                      />
                    )}
                  </div>
                  {t.configHelp && (
                    <span style={{
                      fontFamily: '"New York", Georgia, serif',
                      fontStyle: "italic", fontSize: 10.5,
                      color: "#8E8478", paddingLeft: 2,
                    }}>{t.configHelp}</span>
                  )}
                </div>
              )}

              {/* Hint when not connected */}
              {!isConnected && (
                <span style={{
                  fontSize: 11, color: "#8E8478", fontStyle: "italic",
                  fontFamily: '"New York", Georgia, serif',
                }}>click to authorize</span>
              )}
            </div>
          );
        })}
      </div>

      {!compact && !loading && connected.size === 0 && (
        <div style={{
          marginTop: 12,
          fontFamily: '"New York", Georgia, serif',
          fontStyle: "italic", fontSize: 12, color: "#8E8478",
        }}>
          Connect Slack first — it&apos;s the fastest path to a live demo.
        </div>
      )}
    </div>
  );
}
