import { useState, useEffect } from "react"
import { useToast } from "./Toast"
import {
  getProductos,
  getDepartamentosProd,
  getPresentacionesDeProducto,
  getUnidadesPresentacion,
  upsertSalida,
  upsertPresentacion,
  crearDepartamentoProd,
  type ProductoAlmacen,
  type DepartamentoProd,
  type ProductoPresentacion,
  type UnidadPresentacion,
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
  departamentoInicialId?: number   // ← nueva
  onSaved?: (params: {
    productoId: number
    presentacionId: number
    cantidad: number
    mes: number
    anio: number
  }) => void
}) {
  const toast = useToast()

  // ── Datos base ──
  const [productos, setProductos] = useState<ProductoAlmacen[]>([])
  const [departamentos, setDepartamentos] = useState<DepartamentoProd[]>([])
  const [unidades, setUnidades] = useState<UnidadPresentacion[]>([])
  const [presentaciones, setPresentaciones] = useState<ProductoPresentacion[]>([])

  // ── Estado del formulario ──
  const [productoId, setProductoId] = useState<number>(0)
  const [departamentoId, setDepartamentoId] = useState<number>(0)
  const [presentacionId, setPresentacionId] = useState<number | null>(null)
  const [cantidad, setCantidad] = useState<string>("")
  const [mes, setMes] = useState<number>(new Date().getMonth() + 1)
  const [anio, setAnio] = useState<number>(new Date().getFullYear())

  // ── UI: nuevo departamento ──
  const [showNewDeptInput, setShowNewDeptInput] = useState(false)
  const [newDeptName, setNewDeptName] = useState("")

  // ── UI: nueva presentación inline ──
  const [showNewPresForm, setShowNewPresForm] = useState(false)
  const [newPresUnidadId, setNewPresUnidadId] = useState<number | "">("")
  const [newPresPrecio, setNewPresPrecio] = useState("")
  const [savingPres, setSavingPres] = useState(false)

  // ── Loading ──
  const [loadingData, setLoadingData] = useState(true)
  const [loadingPres, setLoadingPres] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadInitialData() }, [])
  useEffect(() => { if (productoId) cargarPresentaciones(productoId) }, [productoId])
    // Abrir form de nueva presentación automáticamente si el producto no tiene ninguna
useEffect(() => {
  if (!loadingPres && presentaciones.length === 0 && productoId !== 0) {
    setShowNewPresForm(true)
  } else {
    setShowNewPresForm(false)
  }
}, [loadingPres, presentaciones, productoId])

  async function loadInitialData() {
    setLoadingData(true)
    try {
      const [prods, depts, unis] = await Promise.all([
        getProductos(true),
        getDepartamentosProd(),
        getUnidadesPresentacion(),
      ])
      setProductos(prods)
      setDepartamentos(depts)
      setUnidades(unis)
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

  async function cargarPresentaciones(prodId: number) {
    setLoadingPres(true)
    setPresentacionId(null)
    setShowNewPresForm(false)
    try {
      const pres = await getPresentacionesDeProducto(prodId)
      setPresentaciones(pres)
      if (pres.length > 0) {
        setPresentacionId(pres[0].id)
      }
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    } finally {
      setLoadingPres(false)
    }
  }

  async function handleCrearPresentacion() {
    if (!newPresUnidadId || !productoId) return
    const precio = newPresPrecio.trim() !== ""
      ? parseFloat(newPresPrecio.replace(",", "."))
      : null
    if (precio !== null && isNaN(precio)) {
      toast.error("Error", "El precio no es un número válido")
      return
    }
    setSavingPres(true)
    try {
      const presId = await upsertPresentacion(productoId, Number(newPresUnidadId), precio)
      const unidad = unidades.find(u => u.id === Number(newPresUnidadId))
      const nueva: ProductoPresentacion = {
        id: presId,
        producto_id: productoId,
        unidad_id: Number(newPresUnidadId),
        nombre: unidad?.nombre ?? "",
        precio,
      }
      setPresentaciones(prev => [...prev, nueva].sort((a, b) => a.nombre.localeCompare(b.nombre)))
      setPresentacionId(presId)
      setShowNewPresForm(false)
      setNewPresUnidadId("")
      setNewPresPrecio("")
      toast.success("Presentación creada")
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    } finally {
      setSavingPres(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!productoId || !departamentoId || !presentacionId || !cantidad || isNaN(Number(cantidad)) || Number(cantidad) <= 0) {
      toast.error("Error", "Complete todos los campos con valores válidos")
      return
    }
    setSaving(true)
    try {
      await upsertSalida({
        producto_id: productoId,
        departamento_id: departamentoId,
        presentacion_id: presentacionId,
        cantidad: Number(cantidad),
        mes,
        anio,
        tipo_unidad: null,
      })
      toast.success("Salida registrada")
      onSaved?.({ productoId, presentacionId, cantidad: Number(cantidad), mes, anio })
      onClose()
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    } finally {
      setSaving(false)
    }
  }

  const sinPresentaciones = !loadingPres && presentaciones.length === 0 && productoId !== 0
  // Unidades que este producto aún no tiene como presentación
  const unidadesDisponibles = unidades.filter(
    u => !presentaciones.some(p => p.unidad_id === u.id)
  )

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
                    onChange={e => setProductoId(Number(e.target.value))}
                    style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                  >
                    {productos.map(p => <option key={p.id} value={p.id}>{p.referencia} — {p.nombre}</option>)}
                  </select>
                </div>

                {/* ── Tipo de unidad (presentación) ── */}
                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                    <label style={{ fontSize: "12px", fontWeight: 600, color: "#555" }}>Tipo de unidad</label>
                    {/* Botón "añadir" visible cuando ya hay presentaciones y hay unidades disponibles */}
                    {!sinPresentaciones && !showNewPresForm && unidadesDisponibles.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowNewPresForm(true)}
                        style={{ fontSize: "11px", color: "#f97316", background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: 0 }}
                      >
                        ➕ Añadir unidad
                      </button>
                    )}
                  </div>

                  {loadingPres ? (
                    <div style={{ fontSize: "13px", color: "#999", padding: "8px 0" }}>Cargando...</div>

                  ) : showNewPresForm ? (
                    /* ── Formulario inline nueva presentación ── */
                    <div style={{ padding: "14px", borderRadius: "10px", backgroundColor: "#fff7ed", border: "1px solid #fed7aa", display: "flex", flexDirection: "column", gap: "10px" }}>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "#c2410c" }}>
                        {sinPresentaciones ? "⚠️ Sin unidades — crea una para continuar" : "Nueva unidad para este producto"}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                        <div>
                          <label style={{ fontSize: "11px", fontWeight: 600, color: "#555", display: "block", marginBottom: "4px" }}>Tipo de unidad</label>
                          {unidadesDisponibles.length === 0 ? (
                            <div style={{ fontSize: "12px", color: "#64748b", padding: "8px", backgroundColor: "#f1f5f9", borderRadius: "6px" }}>
                              Todas las unidades ya están asignadas.
                            </div>
                          ) : (
                            <select
                              value={newPresUnidadId}
                              onChange={e => setNewPresUnidadId(Number(e.target.value))}
                              style={{ ...inputStyle, width: "100%", boxSizing: "border-box", fontSize: "13px" }}
                            >
                              <option value="">Seleccionar...</option>
                              {unidadesDisponibles.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                            </select>
                          )}
                        </div>
                        <div>
                          <label style={{ fontSize: "11px", fontWeight: 600, color: "#555", display: "block", marginBottom: "4px" }}>Precio € (opcional)</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="Ej: 12,50"
                            value={newPresPrecio}
                            onChange={e => setNewPresPrecio(e.target.value)}
                            style={{ ...inputStyle, width: "100%", boxSizing: "border-box", fontSize: "13px" }}
                          />
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                        {/* Solo mostrar Cancelar si ya había otras presentaciones */}
                        {!sinPresentaciones && (
                          <button
                            type="button"
                            onClick={() => { setShowNewPresForm(false); setNewPresUnidadId(""); setNewPresPrecio("") }}
                            style={{ ...btnStyle, fontSize: "13px", padding: "6px 12px" }}
                          >Cancelar</button>
                        )}
                        <button
                          type="button"
                          onClick={handleCrearPresentacion}
                          disabled={!newPresUnidadId || savingPres}
                          style={{
                            ...btnStyle, fontSize: "13px", padding: "6px 14px",
                            backgroundColor: !newPresUnidadId || savingPres ? "#ccc" : "#f97316",
                            color: "#fff", border: "none",
                          }}
                        >
                          {savingPres ? "Guardando..." : "Crear y seleccionar"}
                        </button>
                      </div>
                    </div>

                  ) : (
                    /* ── Selector normal de presentaciones ── */
                    <select
                      value={presentacionId ?? ""}
                      onChange={e => setPresentacionId(Number(e.target.value))}
                      style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                    >
                      {presentaciones.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}{p.precio != null ? ` — ${p.precio.toLocaleString("es-ES", { minimumFractionDigits: 2 })} €` : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* ── Cantidad ── */}
                <div>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", display: "block", marginBottom: "6px" }}>
                    Cantidad ({productos.find(p => p.id === productoId)?.unidad_medida || "unit"})
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={cantidad}
                    onChange={e => setCantidad(e.target.value)}
                    disabled={sinPresentaciones || showNewPresForm}
                    style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                    placeholder="Ej: 10"
                  />
                </div>

                {/* ── Mes / Año ── */}
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
                >Cancelar</button>
                <button
                  type="submit"
                  disabled={saving || sinPresentaciones || showNewPresForm}
                  style={{
                    ...btnStyle,
                    backgroundColor: (saving || sinPresentaciones || showNewPresForm) ? "#f5f5f5" : "#f97316",
                    color: (saving || sinPresentaciones || showNewPresForm) ? "#aaa" : "#fff",
                    border: "none",
                    opacity: (saving || sinPresentaciones || showNewPresForm) ? 0.7 : 1,
                    cursor: (sinPresentaciones || showNewPresForm) ? "not-allowed" : "pointer",
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
