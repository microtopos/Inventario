import { useState, useEffect } from "react"
import { useToast } from "./Toast"
import {
  getProductos,
  getDepartamentosProd,
  upsertSalida,
  ajustarStock,
  crearDepartamentoProd,
  labelPrecio,
  stockVisible,
  getPreferenciaPres,
  setPreferenciaPres,
  type ProductoAlmacen,
  type DepartamentoProd,
} from "./cleaningService"

const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: "8px",
  border: "1px solid #d1d5db",
  backgroundColor: "#fff",
  fontSize: "14px",
  outline: "none",
  transition: "border-color 0.15s",
}

const btnStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: "8px",
  border: "1px solid #d1d5db",
  backgroundColor: "#fff",
  color: "#374151",
  fontSize: "14px",
  fontWeight: 500,
  cursor: "pointer",
  transition: "all 0.15s",
}

const MESES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
]

export function ModalSalida({
  onClose,
  onSaved,
  departamentoInicialId,
}: {
  onClose: () => void
  departamentoInicialId?: number
  onSaved?: (params: {
    productoId: number
    cantidad: number
    cantidadAnterior: number
    mes: number
    anio: number
  }) => void
}) {
  const toast = useToast()

  const [productos, setProductos] = useState<ProductoAlmacen[]>([])
  const [departamentos, setDepartamentos] = useState<DepartamentoProd[]>([])

  const [productoId, setProductoId] = useState<number>(0)
  const [departamentoId, setDepartamentoId] = useState<number>(0)
  const [cantidad, setCantidad] = useState<string>("")
  const [mes, setMes] = useState<number>(new Date().getMonth() + 1)
  const [anio, setAnio] = useState<number>(new Date().getFullYear())

  // Para tipo CAJA: preferencia de entrada (cajas o unidades)
  const [modoCaja, setModoCaja] = useState<"caja" | "unidad">("caja")

  const [showNewDeptInput, setShowNewDeptInput] = useState(false)
  const [newDeptName, setNewDeptName] = useState("")
  const [loadingData, setLoadingData] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadInitialData() }, [])

  // Al cambiar producto o departamento, leer preferencia guardada
  useEffect(() => {
    if (!productoId || !departamentoId) return
    const prod = productos.find(p => p.id === productoId)
    if (prod?.tipo_producto === "CAJA") {
      setModoCaja(getPreferenciaPres(productoId, departamentoId))
    }
  }, [productoId, departamentoId, productos])

  async function loadInitialData() {
    setLoadingData(true)
    try {
      const [prods, depts] = await Promise.all([
        getProductos(true),
        getDepartamentosProd(),
      ])
      setProductos(prods)
      setDepartamentos(depts)
      if (departamentoInicialId && depts.some(d => d.id === departamentoInicialId))
        setDepartamentoId(departamentoInicialId)
      else if (depts.length > 0)
        setDepartamentoId(depts[0].id)
      if (prods.length > 0) setProductoId(prods[0].id)
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    } finally {
      setLoadingData(false)
    }
  }

  const prodActivo = productos.find(p => p.id === productoId) ?? null
  const esCaja = prodActivo?.tipo_producto === "CAJA" && (prodActivo?.uds_por_caja ?? 1) > 1

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const valorInput = Number(cantidad)
    if (!productoId || !departamentoId || !cantidad || isNaN(valorInput) || valorInput <= 0) {
      toast.error("Error", "Complete todos los campos con valores válidos")
      return
    }

    // Convertir a unidades base
    let cantidadBase = valorInput
    if (esCaja && modoCaja === "caja" && prodActivo?.uds_por_caja) {
      cantidadBase = Math.round(valorInput * prodActivo.uds_por_caja)
    }

    setSaving(true)
    try {
      const cantidadAnterior = await upsertSalida({
        producto_id: productoId,
        departamento_id: departamentoId,
        cantidad: cantidadBase,
        mes,
        anio,
      })

      // Ajustar stock por la diferencia
      const delta = cantidadAnterior - cantidadBase
      await ajustarStock(productoId, delta)

      // Persistir preferencia
      if (esCaja) setPreferenciaPres(productoId, departamentoId, modoCaja)

      toast.success("Salida registrada")
      onSaved?.({ productoId, cantidad: cantidadBase, cantidadAnterior, mes, anio })
      onClose()
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.35)", zIndex: 300 }} />
      <div onClick={e => e.stopPropagation()} style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        backgroundColor: "#fff", borderRadius: "14px", width: "480px",
        maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
        zIndex: 301, overflow: "hidden",
      }}>
        <div style={{ height: "4px", backgroundColor: "#f97316" }} />
        <div style={{ padding: "24px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 20px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ width: "4px", height: "16px", borderRadius: "2px", backgroundColor: "#f97316", display: "inline-block" }} />
            Registrar Salida
          </h2>

          {loadingData ? (
            <div style={{ textAlign: "center", padding: "30px", color: "#999" }}>Cargando...</div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>

                {/* ── Departamento ── */}
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", display: "block", marginBottom: "6px" }}>Departamento</label>
                  {showNewDeptInput ? (
                    <div style={{ display: "flex", gap: "6px" }}>
                      <input
                        type="text"
                        placeholder="Nuevo departamento"
                        value={newDeptName}
                        onChange={e => setNewDeptName(e.target.value)}
                        style={{ ...inputStyle, flex: 1 }}
                        autoFocus
                      />
                      <button
                        type="button"
                        disabled={!newDeptName.trim()}
                        onClick={async () => {
                          if (!newDeptName.trim()) return
                          try {
                            const nuevoId = await crearDepartamentoProd(newDeptName.trim())
                            setDepartamentoId(nuevoId)
                            setNewDeptName("")
                            setShowNewDeptInput(false)
                            setDepartamentos(await getDepartamentosProd())
                            toast.success("Departamento creado")
                          } catch (err: any) {
                            toast.error("Error", err.message)
                          }
                        }}
                        style={{ ...btnStyle, backgroundColor: !newDeptName.trim() ? "#ccc" : "#16a34a", color: "#fff", border: "none" }}
                      >✓</button>
                      <button type="button" onClick={() => { setShowNewDeptInput(false); setNewDeptName("") }} style={btnStyle}>✕</button>
                    </div>
                  ) : (
                    <select
                      value={departamentoId}
                      onChange={e => {
                        if (e.target.value === "nuevo") setShowNewDeptInput(true)
                        else setDepartamentoId(Number(e.target.value))
                      }}
                      style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                    >
                      {departamentos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                      <option value="nuevo">➕ Crear nuevo departamento...</option>
                    </select>
                  )}
                </div>

                {/* ── Producto ── */}
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", display: "block", marginBottom: "6px" }}>Producto</label>
                  <select
                    value={productoId}
                    onChange={e => { setProductoId(Number(e.target.value)); setCantidad("") }}
                    style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                  >
                    {productos.map(p => <option key={p.id} value={p.id}>{p.referencia} — {p.nombre}</option>)}
                  </select>
                  {/* Info del producto seleccionado */}
                  {prodActivo && (
                    <div style={{ marginTop: "6px", fontSize: "12px", color: "#64748b", display: "flex", gap: "8px", alignItems: "center" }}>
                      <span style={{
                        fontSize: "10px", fontWeight: 700, padding: "1px 6px", borderRadius: "4px",
                        backgroundColor: prodActivo.tipo_producto === "CAJA" ? "#f0fdf4" : prodActivo.tipo_producto === "FARDO" ? "#fef3c7" : "#eff6ff",
                        color: prodActivo.tipo_producto === "CAJA" ? "#16a34a" : prodActivo.tipo_producto === "FARDO" ? "#d97706" : "#2563eb",
                      }}>{prodActivo.tipo_producto}</span>
                      <span>{labelPrecio(prodActivo.precio, prodActivo.tipo_producto, prodActivo.uds_por_caja)}</span>
                      {esCaja && (
                        <span style={{ color: "#94a3b8" }}>· {prodActivo.uds_por_caja} uds/caja</span>
                      )}
                    </div>
                  )}
                </div>

                {/* ── Cantidad + toggle cajas/uds (solo CAJA) ── */}
                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                    <label style={{ fontSize: "12px", fontWeight: 600, color: "#555" }}>
                      Cantidad{esCaja ? (modoCaja === "caja" ? " (cajas)" : " (unidades)") : ""}
                    </label>
                    {/* Toggle caja/uds solo para tipo CAJA */}
                    {esCaja && (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "1px", backgroundColor: "#f1f5f9", borderRadius: "6px", padding: "2px" }}>
                        {(["caja", "unidad"] as const).map(v => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => { setModoCaja(v); setCantidad("") }}
                            style={{
                              padding: "2px 10px", fontSize: "11px", fontWeight: 600,
                              border: "none", borderRadius: "4px", cursor: "pointer",
                              backgroundColor: modoCaja === v ? "#2563eb" : "transparent",
                              color: modoCaja === v ? "#fff" : "#94a3b8",
                              transition: "all 0.1s",
                            }}
                          >{v === "caja" ? "Cajas" : "Uds"}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <input
                    type="number"
                    min="0"
                    step={esCaja && modoCaja === "caja" ? "0.5" : "1"}
                    value={cantidad}
                    onChange={e => setCantidad(e.target.value)}
                    style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                    placeholder={esCaja && modoCaja === "caja" ? "Ej: 2" : "Ej: 10"}
                  />
                  {/* Preview de conversión en tiempo real para CAJA */}
                  {esCaja && cantidad && Number(cantidad) > 0 && (
                    <div style={{ marginTop: "4px", fontSize: "11px", color: "#94a3b8" }}>
                      = {stockVisible(
                          modoCaja === "caja"
                            ? Math.round(Number(cantidad) * (prodActivo?.uds_por_caja ?? 1))
                            : Number(cantidad),
                          "CAJA",
                          prodActivo?.uds_por_caja
                        )} en stock
                    </div>
                  )}
                </div>

                {/* ── Mes / Año ── */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", gridColumn: "1 / -1" }}>
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", display: "block", marginBottom: "6px" }}>Mes</label>
                    <select
                      value={mes}
                      onChange={e => setMes(Number(e.target.value))}
                      style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                    >
                      {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", display: "block", marginBottom: "6px" }}>Año</label>
                    <input
                      type="number"
                      min="2000"
                      max="2100"
                      value={anio}
                      onChange={e => setAnio(Number(e.target.value))}
                      style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "6px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{ ...btnStyle, backgroundColor: "#fff", border: "1px solid #ddd", color: "#666" }}
                >Cancelar</button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    ...btnStyle,
                    backgroundColor: saving ? "#f5f5f5" : "#f97316",
                    color: saving ? "#aaa" : "#fff",
                    border: "none",
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? "Guardando..." : "Registrar salida"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  )
}
