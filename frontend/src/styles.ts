import React from "react"

// ─────────────────────────────────────────────────────────────────────────────
// styles.ts — estilos compartidos entre componentes
//
// Uso:  import { cardStyle, thStyle, tdStyle } from "./styles"
// ─────────────────────────────────────────────────────────────────────────────

// ── Tarjetas / contenedores ───────────────────────────────────────────────────

export const cardStyle: React.CSSProperties = {
  backgroundColor: "#fff",
  border: "1px solid #e0e0e0",
  borderRadius: "12px",
}

export const cardStyleLegacy: React.CSSProperties = {
  // Usado en App.tsx (border-radius 10px, sin padding propio)
  backgroundColor: "#fff",
  border: "1px solid #e0e0e0",
  borderRadius: "10px",
  padding: "20px 24px",
}

// ── Tablas ────────────────────────────────────────────────────────────────────

/** Cabecera de tabla estándar */
export const thStyle: React.CSSProperties = {
  padding: "12px 16px",
  textAlign: "left",
  fontSize: "12px",
  fontWeight: 600,
  color: "#888",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
}

/** Cabecera de tabla compacta (historial de pedidos, detalle de tallas) */
export const thStyleSm: React.CSSProperties = {
  padding: "8px 14px",
  textAlign: "left",
  fontSize: "11px",
  fontWeight: 700,
  color: "#aaa",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  whiteSpace: "nowrap",
}

/** Celda de tabla estándar */
export const tdStyle: React.CSSProperties = {
  padding: "12px 16px",
  fontSize: "14px",
  verticalAlign: "middle",
}

/** Celda de tabla compacta */
export const tdStyleSm: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: "13px",
  verticalAlign: "middle",
}

// ── Badges / pills ────────────────────────────────────────────────────────────

export const badgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "3px 9px",
  borderRadius: "20px",
  fontSize: "11px",
  fontWeight: 700,
}

// ── Formularios ───────────────────────────────────────────────────────────────

export const inputStyle: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: "6px",
  border: "1px solid #ddd",
  fontSize: "14px",
  backgroundColor: "#fff",
  outline: "none",
  minWidth: "200px",
}

export const btnStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: "6px",
  fontSize: "14px",
  cursor: "pointer",
  fontWeight: 500,
  whiteSpace: "nowrap",
}

export const btnOutlineStyle: React.CSSProperties = {
  padding: "7px 12px",
  borderRadius: "8px",
  border: "1px solid #e0e0e0",
  backgroundColor: "#fff",
  color: "#555",
  fontSize: "13px",
  cursor: "pointer",
  fontWeight: 500,
}

export const dateInputStyle: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: "8px",
  border: "1px solid #ddd",
  fontSize: "13px",
  backgroundColor: "#fff",
  outline: "none",
  color: "#333",
}

// ── Secciones de dashboard / cards ────────────────────────────────────────────

export const sectionTitleStyle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 700,
  color: "#111",
  marginBottom: "2px",
}

export const sectionSubStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#aaa",
  marginBottom: "0",
}

// ── Ayuda / modales ───────────────────────────────────────────────────────────

export const helpSectionTitle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 700,
  color: "#111",
  marginBottom: "8px",
}

export const helpText: React.CSSProperties = {
  fontSize: "13px",
  color: "#555",
  lineHeight: 1.6,
  margin: "0 0 8px",
}

export const helpList: React.CSSProperties = {
  fontSize: "13px",
  color: "#555",
  lineHeight: 1.7,
  paddingLeft: "20px",
  margin: "0 0 8px",
}

export const helpCode: React.CSSProperties = {
  fontFamily: "monospace",
  fontSize: "12px",
  backgroundColor: "#f3f4f6",
  padding: "1px 5px",
  borderRadius: "4px",
  color: "#374151",
}

// ── Colores de stock (función helper) ─────────────────────────────────────────

export function stockBadgeColors(
  stock: number,
  thresholds: { red: number; orange: number }
): { bg: string; color: string } {
  if (stock <= thresholds.red)    return { bg: "#fee2e2", color: "#991b1b" }
  if (stock <= thresholds.orange) return { bg: "#ffedd5", color: "#c2410c" }
  return { bg: "#dcfce7", color: "#166634" }
}
