import { useState } from "react"
import { useToast } from "./Toast"
import { registrarMovimiento, type ArticuloStock } from "./stockService"

const ACENTO_ENTRADA = "#16a34a"
const ACENTO_SALIDA  = "#dc2626"

interface Props {
  tipo: "entrada" | "salida"
  articulo: ArticuloStock
  onClose: () => void
  onSaved: () => void
}

function fechaHoy() {
  return new Date().toISOString().slice(0, 10)
}

export default function StockMovimientoModal({ tipo, articulo, onClose, onSaved }: Props) {
  const toast = useToast()
  const [cantidad, setCantidad] = useState("")
  const [notas, setNotas] = useState("")
  const [fecha, setFecha] = useState(fechaHoy())
  const [saving, setSaving] = useState(false)

  const cantidadNum = parseInt(cantidad, 10)
  const acento = tipo === "entrada" ? ACENTO_ENTRADA : ACENTO_SALIDA
  const stockDespues = tipo === "entrada"
    ? articulo.stock_actual + (cantidadNum || 0)
    : articulo.stock_actual - (cantidadNum || 0)

  const valid =
    !isNaN(cantidadNum) &&
    cantidadNum > 0 &&
    (tipo === "salida" ? cantidadNum <= articulo.stock_actual : true) &&
    fecha !== ""

  async function handleSubmit() {
    if (!valid) return
    setSaving(true)
    try {
      await registrarMovimiento({
        articulo_id: articulo.id,
        tipo,
        cantidad: cantidadNum,
        notas: notas.trim() || undefined,
        fecha,
      })
      toast.success(tipo === "entrada" ? "Entrada registrada" : "Salida registrada")
      onSaved()
      onClose()
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", borderRadius: "7px",
    border: "1px solid #e0e0e0", fontSize: "14px", boxSizing: "border-box", outline: "none",
  }

  const labelStyle: React.CSSProperties = {
    fontSize: "12px", fontWeight: 600, color: "#555", display: "block", marginBottom: "6px",
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.35)", zIndex: 300 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", backgroundColor: "#fff", borderRadius: "14px", width: "400px", maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 64px rgba(0,0,0,0.18)", zIndex: 301, overflow: "hidden" }}>
        <div style={{ height: "4px", backgroundColor: acento }} />
        <div style={{ padding: "24px" }}>
          {/* Título */}
          <h2 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 4px" }}>
            {tipo === "entrada" ? "↑ Registrar entrada" : "↓ Registrar salida"}
          </h2>
          <div style={{ fontSize: "13px", color: "#888", marginBottom: "20px" }}>
            {articulo.nombre}
          </div>

          {/* Stock actual → después */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", backgroundColor: "#fafafa", borderRadius: "10px", padding: "12px 16px", marginBottom: "20px", border: "1px solid #f0f0f0" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "10px", color: "#bbb", textTransform: "uppercase", letterSpacing: "0.06em" }}>Actual</div>
              <div style={{ fontSize: "22px", fontWeight: 800, color: "#111" }}>{articulo.stock_actual}</div>
              <div style={{ fontSize: "11px", color: "#aaa" }}>{articulo.unidad}</div>
            </div>
            <div style={{ fontSize: "20px", color: acento, fontWeight: 700 }}>
              {tipo === "entrada" ? "+" : "−"}
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "10px", color: "#bbb", textTransform: "uppercase", letterSpacing: "0.06em" }}>Cantidad</div>
              <div style={{ fontSize: "22px", fontWeight: 800, color: acento }}>
                {cantidadNum > 0 ? cantidadNum : "?"}
              </div>
              <div style={{ fontSize: "11px", color: "#aaa" }}>{articulo.unidad}</div>
            </div>
            <div style={{ fontSize: "16px", color: "#ccc" }}>→</div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "10px", color: "#bbb", textTransform: "uppercase", letterSpacing: "0.06em" }}>Resultado</div>
              <div style={{ fontSize: "22px", fontWeight: 800, color: cantidadNum > 0 ? (stockDespues < 0 ? "#dc2626" : "#111") : "#ccc" }}>
                {cantidadNum > 0 ? stockDespues : "?"}
              </div>
              <div style={{ fontSize: "11px", color: "#aaa" }}>{articulo.unidad}</div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {/* Cantidad + Fecha */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={labelStyle}>Cantidad</label>
                <input
                  autoFocus type="number" min="1"
                  step="1"
                  max={tipo === "salida" ? articulo.stock_actual : undefined}
                  value={cantidad} onChange={e => setCantidad(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSubmit()}
                  placeholder="0"
                  style={{ ...inputStyle, borderColor: tipo === "salida" && cantidadNum > articulo.stock_actual ? "#fca5a5" : "#e0e0e0" }}
                />
                {tipo === "salida" && cantidadNum > articulo.stock_actual && (
                  <div style={{ fontSize: "11px", color: "#dc2626", marginTop: "4px" }}>
                    Máximo disponible: {articulo.stock_actual}
                  </div>
                )}
              </div>
              <div>
                <label style={labelStyle}>Fecha</label>
                <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                  style={inputStyle} />
              </div>
            </div>

            {/* Notas */}
            <div>
              <label style={labelStyle}>
                Notas <span style={{ fontWeight: 400, color: "#aaa" }}>(opcional)</span>
              </label>
              <input
                value={notas} onChange={e => setNotas(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
                placeholder={tipo === "entrada" ? "Compra, donación, reposición…" : "Quién lo lleva, para qué…"}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
            <button onClick={onClose}
              style={{ padding: "9px 18px", borderRadius: "8px", border: "1px solid #e0e0e0", backgroundColor: "#fff", color: "#555", fontSize: "14px", cursor: "pointer" }}>
              Cancelar
            </button>
            <button onClick={handleSubmit} disabled={saving || !valid}
              style={{ padding: "9px 20px", borderRadius: "8px", border: "none", backgroundColor: valid && !saving ? acento : "#ccc", color: "#fff", fontSize: "14px", fontWeight: 600, cursor: valid && !saving ? "pointer" : "not-allowed" }}>
              {saving ? "Guardando…" : tipo === "entrada" ? "↑ Registrar entrada" : "↓ Registrar salida"}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
