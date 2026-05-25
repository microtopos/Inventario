import { useState, useRef } from "react"
import { useToast } from "./Toast"
import {
  actualizarProducto,
  crearProducto,
  desactivarProducto,
  reactivarProducto,
  type TipoProducto,
  type CategoriaProducto,
  type ProductoAlmacen,
} from "./cleaningService"

// ─── Estilos base ─────────────────────────────────────────────────────────────

const field: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: "6px",
}

const labelStyle: React.CSSProperties = {
  fontSize: "11px", fontWeight: 700, color: "#64748b",
  textTransform: "uppercase", letterSpacing: "0.06em",
}

const inputStyle: React.CSSProperties = {
  height: "38px", padding: "0 12px",
  border: "1.5px solid #e2e8f0", borderRadius: "8px",
  backgroundColor: "#fff", fontSize: "14px", color: "#1f2937",
  outline: "none", width: "100%", boxSizing: "border-box",
}

const selectStyle: React.CSSProperties = {
  ...inputStyle, cursor: "pointer",
}

// ─── Config visual por tipo ───────────────────────────────────────────────────

const TIPO_INFO: Record<TipoProducto, {
  label: string
  descripcion: string
  precioLabel: string
  stockLabel: string
  icon: string
  accentColor: string
  bg: string
}> = {
  UNIDAD: {
    label: "Unidad",
    descripcion: "Solo se vende / consume por unidades individuales (ej. fregona, bolsa grande).",
    precioLabel: "Precio por unidad (€)",
    stockLabel: "Stock en unidades",
    icon: "📦",
    accentColor: "#2563eb",
    bg: "#eff6ff",
  },
  CAJA: {
    label: "Caja",
    descripcion: "Viene en cajas con N unidades dentro. Se puede pedir por caja o por unidad.",
    precioLabel: "Precio por caja (€)",
    stockLabel: "Stock en unidades totales",
    icon: "🗃️",
    accentColor: "#16a34a",
    bg: "#f0fdf4",
  },
  FARDO: {
    label: "Fardo",
    descripcion: "Producto indivisible que solo se consume en fardos completos (ej. papel higiénico).",
    precioLabel: "Precio por fardo (€)",
    stockLabel: "Stock en fardos",
    icon: "📦",
    accentColor: "#d97706",
    bg: "#fef3c7",
  },
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function ModalProducto({
  producto,
  onClose,
  onSaved,
  categorias,
}: {
  producto: ProductoAlmacen | null
  onClose: () => void
  onSaved: () => void
  categorias: CategoriaProducto[]
}) {
  const toast = useToast()
  const firstInputRef = useRef<HTMLInputElement>(null)

  // ── Campos ──
  const [referencia, setReferencia] = useState(producto?.referencia ?? "")
  const [nombre, setNombre] = useState(producto?.nombre ?? "")
  const [categoriaId, setCategoriaId] = useState<number>(
    producto?.categoria_id ?? categorias[0]?.id ?? 0
  )
  const [tipoProd, setTipoProd] = useState<TipoProducto>(
    producto?.tipo_producto ?? "UNIDAD"
  )
  const [udsPorCaja, setUdsPorCaja] = useState<string>(
    producto?.uds_por_caja != null ? String(producto.uds_por_caja) : ""
  )
  const [precio, setPrecio] = useState<string>(
    producto?.precio != null ? String(producto.precio) : ""
  )

  // ── Desactivar/reactivar (solo en edición) ──
  const [confirmandoDesactivar, setConfirmandoDesactivar] = useState(false)
  const [saving, setSaving] = useState(false)

  // ── Helpers ──

  function precioUnitarioPreview(): string | null {
    const p = parseFloat(precio.replace(",", "."))
    const u = parseInt(udsPorCaja)
    if (tipoProd === "CAJA" && !isNaN(p) && !isNaN(u) && u > 1) {
      return (p / u).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
    }
    return null
  }

  // ── Submit ──

  async function handleSubmit() {
    if (!referencia.trim() || !nombre.trim()) {
      toast.error("Error", "Referencia y nombre son obligatorios")
      return
    }
    if (tipoProd === "CAJA" && (!udsPorCaja || parseInt(udsPorCaja) < 1)) {
      toast.error("Error", "Las cajas necesitan indicar cuántas unidades contienen")
      return
    }

    const precioNum = precio.trim() !== "" ? parseFloat(precio.replace(",", ".")) : null
    if (precioNum !== null && isNaN(precioNum)) {
      toast.error("Error", "El precio no es válido")
      return
    }
    const udsCajaNum = tipoProd === "CAJA" ? (parseInt(udsPorCaja) || null) : null
    // unidad_medida: label descriptivo para estadísticas
    const unidadMedida = tipoProd === "CAJA" ? "UNIDAD" : tipoProd === "FARDO" ? "FARDO" : "UNIDAD"

    setSaving(true)
    try {
      if (producto) {
        await actualizarProducto(producto.id, {
          referencia: referencia.trim(),
          nombre: nombre.trim(),
          categoria_id: categoriaId,
          unidad_medida: unidadMedida,
          precio: precioNum,
          tipo_producto: tipoProd,
          uds_por_caja: udsCajaNum,
        })
        toast.success("Producto actualizado")
      } else {
        await crearProducto(
          referencia.trim(),
          nombre.trim(),
          categoriaId,
          unidadMedida,
          tipoProd,
          udsCajaNum,
          precioNum,
        )
        toast.success("Producto creado")
      }
      onSaved()
      onClose()
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActivo() {
    if (!producto) return
    try {
      if (producto.activo === 1) {
        await desactivarProducto(producto.id)
        toast.success("Producto desactivado")
      } else {
        await reactivarProducto(producto.id)
        toast.success("Producto reactivado")
      }
      onSaved()
      onClose()
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    }
  }

  const tipoCfg = TIPO_INFO[tipoProd]

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", zIndex: 400 }}
      />

      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: "fixed", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          backgroundColor: "#fff", borderRadius: "16px",
          width: "500px", maxWidth: "calc(100vw - 32px)",
          maxHeight: "90vh", display: "flex", flexDirection: "column",
          boxShadow: "0 24px 64px rgba(0,0,0,0.18)", zIndex: 401, overflow: "hidden",
        }}
      >
        {/* Franja de color según tipo */}
        <div style={{ height: "4px", backgroundColor: tipoCfg.accentColor, flexShrink: 0, transition: "background-color 0.2s" }} />

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 24px 0", flexShrink: 0,
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#111827" }}>
              {producto ? "Editar producto" : "Nuevo producto"}
            </h2>
            {producto && (
              <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#94a3b8" }}>
                {producto.referencia}
                {producto.activo === 0 && (
                  <span style={{ marginLeft: "8px", fontSize: "10px", padding: "1px 5px", borderRadius: "4px", backgroundColor: "#f3f4f6", color: "#6b7280", border: "1px solid #e5e7eb" }}>INACTIVO</span>
                )}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ width: "28px", height: "28px", border: "none", backgroundColor: "#f1f5f9", borderRadius: "6px", cursor: "pointer", color: "#64748b", fontSize: "14px", display: "flex", alignItems: "center", justifyContent: "center" }}
          >✕</button>
        </div>

        {/* Cuerpo scrollable */}
        <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* ── Identificación ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em" }}>
              Identificación
            </div>

            <div style={{ display: "flex", gap: "12px" }}>
              <div style={{ ...field, flex: "0 0 130px" }}>
                <label style={labelStyle}>Referencia</label>
                <input
                  ref={firstInputRef}
                  autoFocus
                  type="text"
                  value={referencia}
                  onChange={e => setReferencia(e.target.value)}
                  placeholder="BOLSA-001"
                  style={inputStyle}
                />
              </div>
              <div style={{ ...field, flex: 1 }}>
                <label style={labelStyle}>Nombre / Descripción</label>
                <input
                  type="text"
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  placeholder="Bolsa de basura 50L"
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={field}>
              <label style={labelStyle}>Categoría</label>
              <select value={categoriaId} onChange={e => setCategoriaId(Number(e.target.value))} style={selectStyle}>
                {categorias.map(cat => <option key={cat.id} value={cat.id}>{cat.nombre}</option>)}
              </select>
            </div>
          </div>

          <div style={{ height: "1px", backgroundColor: "#f1f5f9" }} />

          {/* ── Tipo de producto ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em" }}>
              Tipo de producto
            </div>

            {/* Selector de tipo: 3 botones */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
              {(["UNIDAD", "CAJA", "FARDO"] as TipoProducto[]).map(tipo => {
                const cfg = TIPO_INFO[tipo]
                const activo = tipoProd === tipo
                return (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => { setTipoProd(tipo); if (tipo !== "CAJA") setUdsPorCaja("") }}
                    style={{
                      padding: "12px 8px", borderRadius: "10px", cursor: "pointer",
                      border: `2px solid ${activo ? cfg.accentColor : "#e2e8f0"}`,
                      backgroundColor: activo ? cfg.bg : "#fff",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: "4px",
                      transition: "all 0.15s",
                    }}
                  >
                    <span style={{ fontSize: "18px" }}>{cfg.icon}</span>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: activo ? cfg.accentColor : "#374151" }}>{cfg.label}</span>
                  </button>
                )
              })}
            </div>

            {/* Descripción del tipo seleccionado */}
            <p style={{ fontSize: "12px", color: "#64748b", margin: 0, padding: "10px 12px", backgroundColor: tipoCfg.bg, borderRadius: "8px", lineHeight: 1.5 }}>
              {tipoCfg.descripcion}
            </p>

            {/* Campo uds_por_caja — solo visible para CAJA */}
            {tipoProd === "CAJA" && (
              <div style={field}>
                <label style={labelStyle}>Unidades por caja</label>
                <input
                  type="number"
                  min="2"
                  value={udsPorCaja}
                  onChange={e => setUdsPorCaja(e.target.value)}
                  placeholder="Ej: 20"
                  style={inputStyle}
                />
                <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                  Cuántas unidades trae una caja (mínimo 2).
                </span>
              </div>
            )}
          </div>

          <div style={{ height: "1px", backgroundColor: "#f1f5f9" }} />

          {/* ── Precio ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em" }}>
              Precio
            </div>

            <div style={field}>
              <label style={labelStyle}>{tipoCfg.precioLabel}</label>
              <input
                type="text"
                inputMode="decimal"
                value={precio}
                onChange={e => setPrecio(e.target.value)}
                placeholder="Ej: 12,50"
                style={inputStyle}
              />
              {/* Preview precio por unidad para tipo CAJA */}
              {tipoProd === "CAJA" && precioUnitarioPreview() && (
                <span style={{ fontSize: "11px", color: "#16a34a", fontWeight: 600 }}>
                  → {precioUnitarioPreview()} €/unidad
                </span>
              )}
              {tipoProd !== "CAJA" && (
                <span style={{ fontSize: "11px", color: "#94a3b8" }}>Opcional. Se usa para calcular el gasto en estadísticas.</span>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 24px", borderTop: "1px solid #f1f5f9", display: "flex", gap: "8px", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          {/* Botón desactivar/reactivar — solo en edición */}
          {producto && (
            <div>
              {confirmandoDesactivar ? (
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <span style={{ fontSize: "12px", color: producto.activo === 1 ? "#dc2626" : "#64748b" }}>
                    {producto.activo === 1 ? "¿Desactivar?" : "¿Reactivar?"}
                  </span>
                  <button
                    onClick={handleToggleActivo}
                    style={{ padding: "4px 10px", border: "none", borderRadius: "6px", backgroundColor: producto.activo === 1 ? "#dc2626" : "#16a34a", color: "#fff", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                  >Sí</button>
                  <button
                    onClick={() => setConfirmandoDesactivar(false)}
                    style={{ padding: "4px 8px", border: "1px solid #e2e8f0", borderRadius: "6px", backgroundColor: "#fff", color: "#64748b", fontSize: "12px", cursor: "pointer" }}
                  >No</button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmandoDesactivar(true)}
                  style={{ padding: "6px 12px", border: `1px solid ${producto.activo === 1 ? "#fca5a5" : "#d1fae5"}`, borderRadius: "8px", backgroundColor: "#fff", color: producto.activo === 1 ? "#dc2626" : "#16a34a", fontSize: "12px", cursor: "pointer", fontWeight: 500 }}
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = producto.activo === 1 ? "#fef2f2" : "#f0fdf4" }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#fff" }}
                >
                  {producto.activo === 1 ? "Desactivar" : "Reactivar"}
                </button>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: "8px", marginLeft: "auto" }}>
            <button
              onClick={onClose}
              style={{ height: "38px", padding: "0 18px", border: "1.5px solid #e2e8f0", borderRadius: "8px", backgroundColor: "#fff", color: "#64748b", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
            >Cancelar</button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              style={{ height: "38px", padding: "0 22px", border: "none", borderRadius: "8px", backgroundColor: saving ? "#d1fae5" : "#16a34a", color: saving ? "#6ee7b7" : "#fff", fontSize: "13px", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer" }}
            >
              {saving ? "Guardando…" : producto ? "Guardar cambios" : "Crear producto"}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
