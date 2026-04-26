"use client";

/**
 * yappr brand mark — a typographic logo, no illustration.
 *
 * The identity is a deliberate type clash inside the wordmark: lowercase
 * italic serif "y" in clay pigment, then tight sans "appr" in inkwell.
 * The serif italic is the only "moment" of personality — the rest of the
 * UI runs on clean sans, so the wordmark carries the whole brand.
 *
 * Variants:
 *   - "wordmark" (default): the type-clash wordmark
 *   - "mark": just the inkwell tile with a small italic-serif "y" inside,
 *     for square / favicon contexts
 *   - "tile-wordmark": tile + wordmark, for chrome where you want a hit
 *     of contrast next to the type
 */

type Variant = "wordmark" | "mark" | "tile-wordmark";

export function Logo({
  size = 16,
  variant = "wordmark",
}: {
  /** Type size for wordmark variants; tile size for mark variant. */
  size?: number;
  variant?: Variant;
}) {
  const tile = (
    <span
      aria-hidden
      style={{
        width: size * 1.55,
        height: size * 1.55,
        borderRadius: size * 0.34,
        background: "#1A1612",
        color: "#FAF6EE",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: '"New York", "Iowan Old Style", Georgia, serif',
        fontSize: size * 1.05,
        fontWeight: 500,
        fontStyle: "italic",
        letterSpacing: "-0.04em",
        flex: "none",
        paddingBottom: 1,
        boxShadow: "0 1px 2px rgba(26,22,18,0.18)",
      }}
    >
      y
    </span>
  );

  if (variant === "mark") return tile;

  const wordmark = (
    <span
      aria-label="yappr"
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        color: "#1A1612",
        lineHeight: 1,
      }}
    >
      <span
        style={{
          fontFamily: '"New York", "Iowan Old Style", Georgia, serif',
          fontStyle: "italic",
          fontWeight: 500,
          fontSize: size * 1.18,
          letterSpacing: "-0.04em",
          color: "#B5601E",
          marginRight: -1,
        }}
      >
        y
      </span>
      <span
        style={{
          fontFamily: '-apple-system, "SF Pro Display", system-ui',
          fontWeight: 800,
          fontSize: size,
          letterSpacing: "-0.028em",
        }}
      >
        appr
      </span>
    </span>
  );

  if (variant === "tile-wordmark") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: size * 0.55 }}>
        {tile}
        {wordmark}
      </span>
    );
  }

  return wordmark;
}
