"use client";

/**
 * Custom SVG icons for Wire — line-art, currentColor, no emoji.
 * Each patch kind gets a hand-shaped icon. Each external tool too.
 *
 * Style rules (matches Inkwell DNA):
 * - 24x24 viewBox
 * - 1.6 stroke width
 * - currentColor stroke
 * - Round line caps, round joins
 * - No fills (line art only) unless functionally needed
 */

const COMMON = {
  width: 22, height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function PatchIcon({ patchId, ...rest }: { patchId: string } & React.SVGProps<SVGSVGElement>) {
  const Cmp = ICONS[patchId] ?? IconDefault;
  return <Cmp {...COMMON} {...rest} />;
}

export function ToolIcon({ slug, width = 18, height = 18, style }: {
  slug: string;
  width?: number;
  height?: number;
  style?: React.CSSProperties;
}) {
  const url = SVGL_URLS[slug];
  if (!url) return <IconDefault {...COMMON} width={width} height={height} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={slug} width={width} height={height} style={{ display: "block", objectFit: "contain", ...style }} />;
}

const IconDefault = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M12 7v6"/><path d="M12 17h.01"/></svg>
);

// ============================================================
// PATCH ICONS
// ============================================================

const IconSchemaSweeper = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props}>
    {/* a wand sweeping with sparkles */}
    <path d="M5 19l9-9"/>
    <path d="M14 5l5 5"/>
    <path d="M19 5l-3 3"/>
    <path d="M3 12l1.5-1.5"/>
    <path d="M12 21l1.5-1.5"/>
    <circle cx="19.5" cy="14.5" r="0.5" fill="currentColor"/>
    <circle cx="6.5" cy="6.5" r="0.5" fill="currentColor"/>
  </svg>
);

const IconMondayBrief = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props}>
    {/* a window frame with text lines */}
    <rect x="3" y="4" width="18" height="16" rx="2"/>
    <path d="M3 9h18"/>
    <path d="M7 14h6"/>
    <path d="M7 17h10"/>
    <circle cx="6" cy="6.5" r="0.5" fill="currentColor"/>
  </svg>
);

const IconCitationWatch = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props}>
    {/* a bell with an attention dot */}
    <path d="M6 16V11a6 6 0 0 1 12 0v5l1 2H5z"/>
    <path d="M10 20a2 2 0 0 0 4 0"/>
    <circle cx="18" cy="6" r="2.5" fill="currentColor" stroke="none"/>
  </svg>
);

const IconCompetitorSurge = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props}>
    {/* trending arrow + dots */}
    <path d="M3 17l6-6 4 4 8-8"/>
    <path d="M14 7h7v7"/>
  </svg>
);

const IconStaleContent = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props}>
    {/* falling leaf */}
    <path d="M11 21c-1-3 .5-7 4-9 3-2 6-1 6-1s0 4-2 6.5-7 4-8 3.5z"/>
    <path d="M11 21c0-3 2-7 5-9"/>
  </svg>
);

const IconLiftAuditor = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props}>
    {/* bar chart with up arrow */}
    <path d="M4 20V14"/>
    <path d="M9 20V10"/>
    <path d="M14 20v-7"/>
    <path d="M19 20V6"/>
    <path d="M3 20h18"/>
  </svg>
);

const IconNotionDrafter = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props}>
    {/* notebook page */}
    <rect x="5" y="3" width="14" height="18" rx="1.5"/>
    <path d="M9 3v18"/>
    <path d="M12 8h4"/>
    <path d="M12 12h4"/>
    <path d="M12 16h2"/>
  </svg>
);

const IconLinearTriager = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props}>
    {/* triangle with diagonals — Linear-y */}
    <path d="M3 12L12 3l9 9-9 9z"/>
    <path d="M7 12l5-5"/>
    <path d="M12 7l5 5"/>
  </svg>
);

const IconGmailPitcher = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props}>
    {/* envelope with quill flourish */}
    <rect x="3" y="6" width="18" height="13" rx="2"/>
    <path d="M3 8l9 6 9-6"/>
    <path d="M16 4l3 3"/>
  </svg>
);

const IconSchemaCoverage = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props}>
    {/* grid of cells with one highlighted */}
    <rect x="3" y="3" width="7" height="7" rx="1"/>
    <rect x="14" y="3" width="7" height="7" rx="1" fill="currentColor" fillOpacity="0.18"/>
    <rect x="3" y="14" width="7" height="7" rx="1" fill="currentColor" fillOpacity="0.18"/>
    <rect x="14" y="14" width="7" height="7" rx="1"/>
  </svg>
);

const ICONS: Record<string, React.FC<React.SVGProps<SVGSVGElement>>> = {
  "schema-sweeper":   IconSchemaSweeper,
  "slack-brief":      IconMondayBrief,
  "citation-watch":   IconCitationWatch,
  "competitor-surge": IconCompetitorSurge,
  "stale-content":    IconStaleContent,
  "lift-auditor":     IconLiftAuditor,
  "notion-drafter":   IconNotionDrafter,
  "linear-triager":   IconLinearTriager,
  "gmail-pitcher":    IconGmailPitcher,
  "press-pitch":      IconSchemaCoverage,
};

// ============================================================
// TOOL ICONS
// ============================================================

/**
 * Brand logos via svgl.app — official-looking marks, no hand-rolled approximations.
 * Hot-linked because svgl is a CDN-grade public asset host. We could mirror to
 * /public if we ever need to ship offline.
 */
const SVGL_URLS: Record<string, string> = {
  github: "https://svgl.app/library/github_light.svg",
  slack:  "https://svgl.app/library/slack.svg",
  notion: "https://svgl.app/library/notion.svg",
  linear: "https://svgl.app/library/linear.svg",
  gmail:  "https://svgl.app/library/gmail.svg",
};

// ============================================================
// CRON SCHEDULE VISUALIZER
// ============================================================

/**
 * Renders a small visualization of a cron pattern.
 * Currently supports: daily at hour, weekly on day at hour, hourly, manual, anomaly.
 */
export function CronViz({ cronSpec, kind, label }: {
  cronSpec?: string;
  kind: "cron" | "anomaly" | "manual";
  label: string;
}) {
  if (kind === "anomaly") {
    return (
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <svg width="40" height="14" viewBox="0 0 40 14">
          <path d="M0 7 Q 4 7 8 6 Q 12 5 14 4 L 16 1 L 18 12 L 20 7 Q 24 6 28 7 L 40 7" stroke="#B73B4F" strokeWidth="1.2" fill="none"/>
        </svg>
        <span style={{ fontSize: 11, fontFamily: '-apple-system, "SF Pro Text", system-ui', color: "#4A413A" }}>{label}</span>
      </div>
    );
  }
  if (kind === "manual") {
    return (
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="3" fill="#4A413A"/></svg>
        <span style={{ fontSize: 11, fontFamily: '-apple-system, "SF Pro Text", system-ui', color: "#4A413A" }}>{label}</span>
      </div>
    );
  }

  // cron — parse spec to get hour + day-of-week
  const parts = (cronSpec ?? "").trim().split(/\s+/);
  const hour = parts[1] ?? "?";
  const dow = parts[4] ?? "*";

  if (dow === "*") {
    // Daily — show 24 ticks with the hour highlighted
    return (
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <svg width="68" height="14" viewBox="0 0 68 14">
          {Array.from({ length: 24 }, (_, i) => {
            const x = 1 + i * 2.7;
            const isHour = parseInt(hour) === i;
            return (
              <line key={i} x1={x} y1={isHour ? 1 : 5} x2={x} y2={isHour ? 13 : 9}
                    stroke={isHour ? "#B5601E" : "#8E8478"}
                    strokeWidth={isHour ? 1.6 : 1}
                    strokeLinecap="round"/>
            );
          })}
        </svg>
        <span style={{ fontSize: 11, fontFamily: '-apple-system, "SF Pro Text", system-ui', color: "#4A413A" }}>{label}</span>
      </div>
    );
  }

  // Weekly — 7 day dots
  const daysHit = new Set(dow.split(",").map((s) => parseInt(s)).filter((n) => !Number.isNaN(n)));
  const dayLetters = ["S", "M", "T", "W", "T", "F", "S"];
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <div style={{ display: "inline-flex", gap: 3 }}>
        {dayLetters.map((d, i) => {
          const hit = daysHit.has(i);
          return (
            <span key={i} style={{
              fontSize: 9, fontWeight: 800,
              width: 12, height: 12, borderRadius: 999,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              background: hit ? "#B5601E" : "rgba(26,22,18,0.06)",
              color: hit ? "#FAF6EE" : "#8E8478",
            }}>{d}</span>
          );
        })}
      </div>
      <span style={{ fontSize: 11, fontFamily: '-apple-system, "SF Pro Text", system-ui', color: "#4A413A" }}>{label}</span>
    </div>
  );
}
