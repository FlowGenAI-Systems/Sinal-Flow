import React from "react";

/**
 * Logo oficial FlowgenAI para a sidebar navy do cockpit.
 * <FlowgenLogo/> = ícone (placa teal) + wordmark "FlowgenAI" (Sora, "AI" em teal vivo).
 * Igual ao header da sidebar do FlowgenAI OS - Cockpit.
 */
export function FlowgenIcon({ size = 38 }: { size?: number }) {
  return (
    <span
      style={{
        width: size, height: size, borderRadius: 11, flex: "none",
        background: "rgba(45,212,191,.12)", border: "1px solid rgba(45,212,191,.2)",
        display: "grid", placeItems: "center", color: "#2DD4BF",
      }}
    >
      <svg width={size * 0.52} height={size * 0.52} viewBox="0 0 64 64" fill="none" role="img" aria-label="FlowgenAI">
        <path d="M20 46V18H44V28H30V46" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="20" cy="18" r="4.5" fill="#60A5FA" />
        <circle cx="44" cy="28" r="4.5" fill="currentColor" />
        <circle cx="30" cy="46" r="4.5" fill="currentColor" />
      </svg>
    </span>
  );
}

export function FlowgenLogo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <FlowgenIcon />
      <span style={{ lineHeight: 1.1 }}>
        <b style={{ fontFamily: "'Sora',sans-serif", fontSize: 15, fontWeight: 700, color: "#fff", display: "block" }}>
          Flowgen<span style={{ color: "#2DD4BF" }}>AI</span>
        </b>
        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "#8694A8" }}>
          sinal &gt; ruído
        </span>
      </span>
    </div>
  );
}
