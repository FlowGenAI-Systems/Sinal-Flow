import React from "react";

/**
 * Logo oficial FlowgenAI para o app (cockpit dark).
 * - <FlowgenIcon/>  : só o grafismo do fluxo (sidebar compacta / favicon).
 * - <FlowgenLogo/>  : grafismo + wordmark "FlowgenAI" (Sora 800, "AI" em teal).
 * Cores da marca: navy #0F172A · branco · acento #2DD4BF · azul #60A5FA.
 */

export function FlowgenIcon({ size = 36, plated = true }: { size?: number; plated?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" role="img" aria-label="FlowgenAI">
      {plated && <rect width="64" height="64" rx="16" fill="#141E33" />}
      <path d="M20 46V18H44V28H30V46" stroke="#FFFFFF" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="20" cy="18" r="4.5" fill="#60A5FA" />
      <circle cx="44" cy="28" r="4.5" fill="#2DD4BF" />
      <circle cx="30" cy="46" r="4.5" fill="#2DD4BF" />
    </svg>
  );
}

export function FlowgenLogo({ iconSize = 32 }: { iconSize?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <FlowgenIcon size={iconSize} />
      <span
        style={{
          fontFamily: "'Sora', system-ui, sans-serif",
          fontWeight: 800,
          fontSize: "1.15rem",
          letterSpacing: "-0.02em",
          color: "#FFFFFF",
          lineHeight: 1,
        }}
      >
        Flowgen<span style={{ color: "#2DD4BF" }}>AI</span>
      </span>
    </div>
  );
}
