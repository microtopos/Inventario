import React from "react"

// ── Estilos base compartidos ──────────────────────────────────────────────────

export const fieldLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "11px",
  fontWeight: 600,
  color: "#aaa",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: "6px",
}

export const fieldValueStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#333",
  fontWeight: 500,
  padding: "2px 0",
}

export const fieldInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: "7px",
  border: "1px solid #ddd",
  fontSize: "14px",
  boxSizing: "border-box",
  outline: "none",
  backgroundColor: "#fff",
}

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface FieldProps {
  /** Etiqueta superior en versalitas */
  label: string
  /** Modo edición — muestra el children o el input por defecto */
  editing?: boolean
  /** Valor mostrado en modo lectura */
  value?: string | null
  /**
   * En modo edición:
   * - Si se pasa, se renderiza tal cual (ColorSelect, DepartmentSelect, textarea…)
   * - Si no se pasa, se renderiza un <input> con value/onChange/placeholder
   */
  children?: React.ReactElement
  /** Solo cuando editing=true y NO hay children custom */
  onChange?: (v: string) => void
  /** Placeholder del input por defecto */
  placeholder?: string
  /** autoFocus del input por defecto */
  autoFocus?: boolean
  /** Si true, el valor de solo lectura se muestra en monospace (para códigos) */
  mono?: boolean
  /** Estilo extra para el wrapper externo */
  style?: React.CSSProperties
}

// ── Componente ────────────────────────────────────────────────────────────────

export function Field({
  label,
  editing = false,
  value,
  children,
  onChange,
  placeholder,
  autoFocus,
  mono,
  style,
}: FieldProps) {
  const displayValue = value ?? ""
  const isEmpty = !displayValue

  return (
    <div style={style}>
      <label style={fieldLabelStyle}>{label}</label>

      {editing ? (
        // Modo edición
        children ?? (
          <input
            autoFocus={autoFocus}
            placeholder={placeholder}
            value={displayValue}
            onChange={e => onChange?.(e.target.value)}
            style={fieldInputStyle}
          />
        )
      ) : (
        // Modo lectura
        <div
          style={{
            ...fieldValueStyle,
            fontFamily: mono && !isEmpty ? "monospace" : "inherit",
            color: isEmpty ? "#ccc" : "#333",
          }}
        >
          {isEmpty ? "—" : displayValue}
        </div>
      )}
    </div>
  )
}
