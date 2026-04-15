import { useState, useEffect } from "react"
import { useToast } from "./Toast"
import {
  getProductos,
  getDepartamentosProd,
  upsertSalida,
  crearDepartamentoProd,
  type ProductoAlmacen,
  type DepartamentoProd,
} from "./productosService"

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

export function ModalSalida({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const [productos, setProductos] = useState<ProductoAlmacen[]>([])
  const [departamentos, setDepartamentos] = useState<DepartamentoProd[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [saving, setSaving] = useState(false)
  const [productoId, setProductoId] = useState<number>(0)
  const [departamentoId, setDepartamentoId] = useState<number>(0)
  const [cantidad, setCantidad] = useState<string>("")
  const [mes, setMes] = useState<number>(new Date().getMonth() + 1)
  const [anio, setAnio] = useState<number>(new Date().getFullYear())
  const [showNewDeptInput, setShowNewDeptInput] = useState(false)
  const [newDeptName, setNewDeptName] = useState("")

  useEffect(() => {
    loadInitialData()
  }, [])

  async function loadInitialData() {
    setLoadingData(true)
    try {
      const [prods, depts] = await Promise.all([
        getProductos(true),
        getDepartamentosProd(),
      ])
      setProductos(prods)
      setDepartamentos(depts)
      if (prods.length > 0) setProductoId(prods[0].id)
      if (depts.length > 0) setDepartamentoId(depts[0].id)
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    } finally {
      setLoadingData(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!productoId || !departamentoId || !cantidad || isNaN(Number(cantidad)) || Number(cantidad) <= 0) {
      toast.error("Error", "Complete todos los campos con valores válidos")
      return
    }
    setSaving(true)
    try {
      await upsertSalida({
        producto_id: productoId,
        departamento_id: departamentoId,
        cantidad: Number(cantidad),
        mes,
        anio,
      })
      toast.success("Salida registrada")
      onClose()
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    } finally {
      setSaving(false)
    }
  }

  const selectedProd = productos.find(p => p.id === productoId)

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.35)", zIndex: 300 }} />
      <div onClick={(e) => e.stopPropagation()} style={{
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
                {/* Producto */}
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", display: "block", marginBottom: "6px" }}>Producto</label>
                  <select
                    value={productoId}
                    onChange={e => setProductoId(Number(e.target.value))}
                    style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                  >
                    {productos.map(p => (
                      <option key={p.id} value={p.id}>{p.referencia} — {p.nombre}</option>
                    ))}
                  </select>
                </div>

                {/* Departamento */}
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
                        onClick={async () => {
                          if (!newDeptName.trim()) {
                            toast.error("Error", "Ingresa un nombre para el departamento")
                            return
                          }
                          try {
                            const nuevoId = await crearDepartamentoProd(newDeptName.trim())
                            setDepartamentoId(nuevoId)
                            setNewDeptName("")
                            setShowNewDeptInput(false)
                            const depts = await getDepartamentosProd()
                            setDepartamentos(depts)
                            toast.success("Departamento creado")
                          } catch (err: any) {
                            toast.error("Error", err.message || "No se pudo crear el departamento")
                          }
                        }}
                        disabled={!newDeptName.trim()}
                        style={{ ...btnStyle, backgroundColor: (!newDeptName.trim()) ? "#ccc" : "#16a34a", color: "#fff", border: "none" }}
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowNewDeptInput(false); setNewDeptName("") }}
                        style={btnStyle}
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <select
                      value={departamentoId}
                      onChange={e => {
                        const val = e.target.value
                        if (val === "nuevo") setShowNewDeptInput(true)
                        else setDepartamentoId(Number(val))
                      }}
                      style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                    >
                      {departamentos.map(d => (
                        <option key={d.id} value={d.id}>{d.nombre}</option>
                      ))}
                      <option value="nuevo">➕ Crear nuevo departamento...</option>
                    </select>
                  )}
                </div>

                {/* Cantidad */}
                <div>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", display: "block", marginBottom: "6px" }}>Cantidad ({productos.find(p => p.id === productoId)?.unidad_medida || 'unit'})</label>
                  <input
                    type="number"
                    min="0"
                    value={cantidad}
                    onChange={e => setCantidad(e.target.value)}
                    style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                    placeholder="Ej: 10"
                  />
                </div>

                {/* Mes / Año */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
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

              <div style={{ display: "flex", gap: "10px", marginTop: "20px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{ ...btnStyle, backgroundColor: "#fff", border: "1px solid #ddd", color: "#666" }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{ ...btnStyle, backgroundColor: saving ? "#f5f5f5" : "#f97316", color: saving ? "#aaa" : "#fff", border: "none", opacity: saving ? 0.7 : 1 }}
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
