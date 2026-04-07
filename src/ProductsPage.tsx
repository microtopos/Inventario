import { useState, useEffect, useMemo, useCallback } from "react"
import AppHeader from "./AppHeader"
import type { Page } from "./AppHeader"
import { useToast } from "./Toast"
import {
  getCategorias,
  getProductos,
  getDepartamentosProd,
  upsertSalida,
  getConsumoMensualPorDepartamento,
  getMatrizConsumo,
  getResumenPorDepartamento,
  getSalidas,
  crearDepartamentoProd,
  type CategoriaProducto,
  type ProductoAlmacen,
  type DepartamentoProd,
  type ConsumoMensualDepartamento,
  type MatrizConsumo,
  type ResumenDepartamento,
  type SalidaProducto,
} from "./productosService"
import VistaCatalogoMejorada from "./VistaCatalogoMejorada"
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Legend,
} from 'recharts'

const COLORS = [
  "#2563eb", "#16a34a", "#dc2626", "#9333ea",
  "#ea580c", "#0891b2", "#4ade80", "#f59e0b",
]

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      backgroundColor: "#fff",
      border: "1px solid #e0e0e0",
      borderRadius: "8px",
      padding: "10px 12px",
      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
      fontSize: "12px",
    }}>
      <p style={{ margin: "0 0 4px", fontWeight: 600, color: "#111" }}>{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ margin: 0, color: entry.color }}>
          {entry.name}: <strong>{entry.value.toLocaleString()}</strong>
        </p>
      ))}
    </div>
  )
}

function PieTooltip({ active, payload }: any) {
  const p = payload[0]
  if (!active || !p) return null
  return (
    <div style={{
      backgroundColor: "#fff",
      border: "1px solid #e0e0e0",
      borderRadius: "8px",
      padding: "10px 12px",
      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
      fontSize: "12px",
      textAlign: "center",
    }}>
      <p style={{ margin: 0, fontWeight: 600, color: p.payload.name }}>
        {p.payload.name}
      </p>
      <p style={{ margin: "4px 0 0", color: p.color }}>
        {p.value.toLocaleString()} ({p.payload.pct}%)
      </p>
    </div>
  )
}

function pivotByMes(rows: { mes: string; departamento: string; total: number }[]) {
  const byMes = new Map<string, any>()
  const departmentsSet = new Set<string>()

  for (const row of rows) {
    departmentsSet.add(row.departamento)
    if (!byMes.has(row.mes)) byMes.set(row.mes, { mes: row.mes })
    byMes.get(row.mes)[row.departamento] = row.total
  }

  const departments = Array.from(departmentsSet).sort((a, b) => a.localeCompare(b))
  const data = Array.from(byMes.values())
  return { departments, data }
}

function sumByDepartamento(pivot: ReturnType<typeof pivotByMes>) {
  const totals: Record<string, number> = {}
  for (const row of pivot.data) {
    for (const [dept, val] of Object.entries(row)) {
      if (dept !== "mes" && typeof val === "number") {
        totals[dept] = (totals[dept] ?? 0) + val
      }
    }
  }
  return totals
}

function sumPivot(pivot: ReturnType<typeof pivotByMes>): number {
  return Object.values(sumByDepartamento(pivot)).reduce((a, b) => a + b, 0)
}


// ============================================================================
// TYPES & UTILITIES
// ============================================================================

type SubPage = "catalog" | "register" | "stats"

const MESES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
]

function formatEuro(n: number): string {
  return n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"
}

function hoy(): Date {
  return new Date()
}

// ============================================================================
// SHARED STYLES (reuse from original inline patterns)
// ============================================================================

const inputStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: "10px",
  border: "1.5px solid #e2e8f0",
  backgroundColor: "#fff",
  fontSize: "14px",
  outline: "none",
  transition: "border-color 0.15s, box-shadow 0.15s",
  color: "#334155",
}

const btnStyle: React.CSSProperties = {
  padding: "9px 18px",
  borderRadius: "10px",
  border: "1.5px solid #e2e8f0",
  backgroundColor: "#fff",
  color: "#475569",
  fontSize: "13px",
  fontWeight: 500,
  cursor: "pointer",
  transition: "all 0.15s",
}

const thStyle: React.CSSProperties = {
  padding: "14px 16px",
  textAlign: "left",
  backgroundColor: "#f8fafc",
  borderBottom: "1.5px solid #e2e8f0",
  fontWeight: 600,
  color: "#64748b",
  fontSize: "11px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
}

const tdStyle: React.CSSProperties = {
  padding: "14px 16px",
  color: "#334155",
  fontSize: "14px",
}

const cardStyle: React.CSSProperties = {
  backgroundColor: "#fff",
  border: "1px solid #f1f5f9",
  borderRadius: "16px",
  padding: "22px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)",
}




// ============================================================================
// SUB-VIEW: REGISTRAR SALIDA
// ============================================================================

function VistaRegistrarSalida() {
  const toast = useToast()
  const [productos, setProductos] = useState<ProductoAlmacen[]>([])
  const [departamentos, setDepartamentos] = useState<DepartamentoProd[]>([])
  const [loadingData, setLoadingData] = useState(false)
  const [saving, setSaving] = useState(false)

  const [productoId, setProductoId] = useState<number>(0)
  const [departamentoId, setDepartamentoId] = useState<number>(0)
  const [cantidad, setCantidad] = useState<string>("")
  const [mes, setMes] = useState<number>(hoy().getMonth() + 1)
  const [anio, setAnio] = useState<number>(hoy().getFullYear())
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

  const recargarDepartamentos = async () => {
    try {
      const depts = await getDepartamentosProd()
      setDepartamentos(depts)
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
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
      toast.success("Salida registrada/actualizada")
      setCantidad("")
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    } finally {
      setSaving(false)
    }
  }

  if (loadingData) {
    return <div style={{ padding: "40px", textAlign: "center", color: "#888" }}>Cargando datos...</div>
  }

  const selectedProd = productos.find(p => p.id === productoId)

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto" }}>
      <div style={cardStyle}>
        <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a", marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ width: "4px", height: "20px", borderRadius: "2px", backgroundColor: "#22c55e", display: "inline-block" }} />
          Registrar Salida
        </h3>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
          {/* Producto */}
          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", marginBottom: "6px", display: "block" }}>Producto</label>
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
          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", marginBottom: "6px", display: "block" }}>Departamento</label>
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
                      // Recargar lista de departamentos
                      await recargarDepartamentos()
                      toast.success("Departamento creado")
                    } catch (err: any) {
                      toast.error("Error", err.message || "No se pudo crear el departamento")
                    }
                  }}
                  disabled={!newDeptName.trim()}
                  style={{
                    ...btnStyle,
                    padding: "8px 12px",
                    backgroundColor: (!newDeptName.trim()) ? "#ccc" : "#16a34a",
                    color: "#fff",
                    border: "none"
                  }}
                >
                  ✓
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewDeptInput(false)
                    setNewDeptName("")
                  }}
                  style={{ ...btnStyle, padding: "8px 12px" }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <select
                value={departamentoId}
                onChange={e => {
                  const val = e.target.value
                  if (val === "nuevo") {
                    setShowNewDeptInput(true)
                  } else {
                    setDepartamentoId(Number(val))
                  }
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
            <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", marginBottom: "6px", display: "block" }}>Cantidad ({productos.find(p => p.id === productoId)?.unidad_medida || 'unit'})</label>
            <input
              type="number"
              min="0"
              value={cantidad}
              onChange={e => setCantidad(e.target.value)}
              style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
              placeholder="Ej: 10"
            />
          </div>

          {/* Mes */}
          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", marginBottom: "6px", display: "block" }}>Mes</label>
            <select
              value={mes}
              onChange={e => setMes(Number(e.target.value))}
              style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
            >
              {MESES.map((m, i) => (
                <option key={i+1} value={i+1}>{m}</option>
              ))}
            </select>
          </div>

          {/* Año */}
          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", marginBottom: "6px", display: "block" }}>Año</label>
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

        <div style={{ marginTop: "6px", display: "flex", justifyContent: "flex-end", paddingTop: "16px", borderTop: "1px solid #f1f5f9" }}>
          <button
            type="submit"
            disabled={saving}
            style={{
              ...btnStyle,
              backgroundColor: saving ? "#e2e8f0" : "#22c55e",
              color: saving ? "#94a3b8" : "#fff",
              border: "none",
              padding: "12px 32px",
              fontSize: "14px",
              fontWeight: 600,
              borderRadius: "10px",
              boxShadow: saving ? "none" : "0 2px 8px rgba(34,197,94,0.25)",
            }}
          >
            {saving ? "Guardando..." : "Registrar salida"}
          </button>
        </div>
        </form>
      </div>
    </div>
  )
}

// ============================================================================
// VISTA: ESTADÍSTICAS DE PRODUCTOS
// ============================================================================

function VistaEstadisticas() {
  const toast = useToast()
  const [departamentos, setDepartamentos] = useState<DepartamentoProd[]>([])
  const [categorias, setCategorias] = useState<CategoriaProducto[]>([])
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [mes, setMes] = useState(new Date().getMonth() + 1)
  const [categoriaId, setCategoriaId] = useState<number | "">("")
  const [departamentoFiltro, setDepartamentoFiltro] = useState<number | "">("")
  const [matriz, setMatriz] = useState<MatrizConsumo[]>([])
  const [consumoMensual, setConsumoMensual] = useState<ConsumoMensualDepartamento[]>([])
  const [resumen, setResumen] = useState<ResumenDepartamento[]>([])
  const [salidasFiltradas, setSalidasFiltradas] = useState<SalidaProducto[]>([])
  const [loadingGeneral, setLoadingGeneral] = useState(false)
  const [loadingSalidas, setLoadingSalidas] = useState(false)
  const [showNewDeptInput, setShowNewDeptInput] = useState(false)
  const [newDeptName, setNewDeptName] = useState("")

  useEffect(() => {
    Promise.all([getDepartamentosProd(), getCategorias()]).then(([depts, cats]) => {
      setDepartamentos(depts)
      setCategorias(cats)
    }).catch(e => {
      toast.error("Error", e?.message ?? String(e))
    })
  }, [])

  useEffect(() => {
    loadGeneralStats()
  }, [anio, mes, categoriaId])

  useEffect(() => {
    loadSalidasFiltradas()
  }, [anio, mes, categoriaId, departamentoFiltro])

  async function loadGeneralStats() {
    setLoadingGeneral(true)
    try {
      const [matrizData, consumoData, resumenData] = await Promise.all([
        getMatrizConsumo(anio, mes, categoriaId === "" ? undefined : Number(categoriaId)),
        getConsumoMensualPorDepartamento({ anio_desde: anio, anio_hasta: anio }),
        getResumenPorDepartamento({ anio, categoria_id: categoriaId === "" ? undefined : Number(categoriaId) }),
      ])
      setMatriz(matrizData.matriz)
      setConsumoMensual(consumoData)
      setResumen(resumenData)
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    } finally {
      setLoadingGeneral(false)
    }
  }

  async function loadSalidasFiltradas() {
    setLoadingSalidas(true)
    setSalidasFiltradas([])
    try {
      const salidasData = await getSalidas({
        anio,
        mes,
        departamento_id: departamentoFiltro === "" ? undefined : Number(departamentoFiltro),
        categoria_id: categoriaId === "" ? undefined : Number(categoriaId),
      })
      setSalidasFiltradas(salidasData)
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    } finally {
      setLoadingSalidas(false)
    }
  }

  const recargarDepartamentos = async () => {
    try {
      const depts = await getDepartamentosProd()
      setDepartamentos(depts)
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    }
  }

  // Prepare bar chart data: monthly consumption for selected year, grouped by department
  const barChartData = useMemo(() => {
    const map = new Map<string, any>()
    consumoMensual.forEach(item => {
      const mesNombre = MESES[item.mes - 1]
      if (!map.has(mesNombre)) map.set(mesNombre, { mes: mesNombre })
      map.get(mesNombre)[item.departamento_nombre] = item.total_cantidad
    })
    return Array.from(map.values())
  }, [consumoMensual])

  const aniosPosibles = Array.from(new Set([anio, anio-1, anio-2, anio-3, anio-4]))

  // Handle cell edit in matrix
  const handleCellChange = useCallback(async (producto_id: number, departamento_id: number, cantidadStr: string) => {
    const cantidad = Number(cantidadStr)
    if (isNaN(cantidad) || cantidad < 0) return

    const oldMatriz = [...matriz]
    const rowIndex = matriz.findIndex(r => r.producto_id === producto_id)
    if (rowIndex === -1) return
    const key = `dep_${departamento_id}`
    const newMatriz = matriz.map(r => r.producto_id === producto_id ? { ...r, [key]: cantidad } : r)
    setMatriz(newMatriz)

    try {
      await upsertSalida({
        producto_id,
        departamento_id,
        cantidad,
        mes,
        anio,
      })
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
      setMatriz(oldMatriz)
    }
  }, [matriz, mes, anio, toast])

  return (
    <div>
      {/* Filter bar */}
      <div style={cardStyle}>
        <div style={{ fontSize: "12px", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "14px" }}>Filtros</div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <label style={{ fontSize: "13px", color: "#64748b" }}>Año</label>
            <select value={anio} onChange={e => setAnio(Number(e.target.value))} style={{ ...inputStyle, width: "95px" }}>
              {aniosPosibles.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <label style={{ fontSize: "13px", color: "#64748b" }}>Mes</label>
            <select value={mes} onChange={e => setMes(Number(e.target.value))} style={{ ...inputStyle, width: "110px" }}>
              {MESES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <label style={{ fontSize: "13px", color: "#64748b" }}>Categoría</label>
            <select value={categoriaId} onChange={e => setCategoriaId(e.target.value === "" ? "" : Number(e.target.value))} style={{ ...inputStyle, width: "170px" }}>
              <option value="">Todas</option>
              {categorias.map(cat => <option key={cat.id} value={cat.id}>{cat.nombre}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <label style={{ fontSize: "13px", color: "#64748b" }}>Depto</label>
            {showNewDeptInput ? (
              <div style={{ display: "flex", gap: "6px" }}>
                <input type="text" placeholder="Nuevo depto" value={newDeptName} onChange={e => setNewDeptName(e.target.value)} style={{ ...inputStyle, width: "130px" }} autoFocus />
                <button
                  onClick={async () => {
                    if (!newDeptName.trim()) { toast.error("Error", "Ingresa un nombre"); return }
                    try {
                      const nuevoId = await crearDepartamentoProd(newDeptName.trim())
                      setDepartamentoFiltro(nuevoId); setNewDeptName(""); setShowNewDeptInput(false)
                      await recargarDepartamentos()
                      toast.success("Departamento creado")
                    } catch (err: any) { toast.error("Error", err.message || "No se pudo crear") }
                  }}
                  disabled={!newDeptName.trim()}
                  style={{ ...btnStyle, padding: "8px 12px", backgroundColor: (!newDeptName.trim()) ? "#cbd5e1" : "#22c55e", color: "#fff", border: "none" }}
                >✓</button>
                <button onClick={() => { setShowNewDeptInput(false); setNewDeptName("") }} style={{ ...btnStyle, padding: "8px 12px" }}>✕</button>
              </div>
            ) : (
              <select value={departamentoFiltro} onChange={e => {
                const val = e.target.value
                if (val === "nuevo") setShowNewDeptInput(true)
                else setDepartamentoFiltro(val === "" ? "" : Number(val))
              }} style={{ ...inputStyle, width: "170px" }}>
                <option value="">Todos</option>
                {departamentos.map(dep => <option key={dep.id} value={dep.id}>{dep.nombre}</option>)}
                <option value="nuevo">➕ Crear nuevo...</option>
              </select>
            )}
          </div>
          <button
            onClick={() => { loadGeneralStats(); loadSalidasFiltradas() }}
            style={{ ...btnStyle, backgroundColor: "#3b82f6", color: "#fff", border: "none", fontSize: "13px", fontWeight: 600, padding: "10px 20px", borderRadius: "10px" }}
          >
            ↻ Actualizar
          </button>
        </div>
        <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "10px" }}>
          El filtro de departamento se aplica únicamente a la tabla de salidas.
        </div>
      </div>

      {loadingGeneral ? (
        <div style={{ padding: "60px", textAlign: "center", color: "#94a3b8" }}>Cargando estadísticas...</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px", marginTop: "4px" }}>

          {/* Charts side by side */}
          <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
            {/* Pie: distribución por departamento */}
            {resumen.length > 0 && (
              <div style={{ ...cardStyle, flex: "1 1 380px" }}>
                <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a", marginBottom: "12px" }}>
                  Distribución por departamento
                </h3>
                <div style={{ height: "280px" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={resumen.map(r => ({
                          name: r.departamento_nombre,
                          value: r.total_cantidad,
                          pct: ((r.total_cantidad / resumen.reduce((s, r) => s + r.total_cantidad, 0)) * 100).toFixed(1),
                        }))}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={95}
                        innerRadius={38}
                        label={({ name, pct }) => `${name} (${pct}%)`}
                        labelLine={false}
                      >
                        {resumen.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<PieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
            {/* Bar: consumo mensual */}
            {barChartData.length > 0 && (
              <div style={{ ...cardStyle, flex: "1 1 380px" }}>
                <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a", marginBottom: "12px" }}>
                  Consumo mensual por departamento
                </h3>
                <div style={{ height: "280px" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barChartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                      <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "#666" }} />
                      <YAxis tickFormatter={v => v.toLocaleString()} tick={{ fontSize: 12, fill: "#666" }} />
                      <Tooltip />
                      <Legend />
                      {departamentos.map((dept, i) => (
                        <Bar key={dept.id} dataKey={dept.nombre} stackId="a" fill={["#16a34a", "#22c55e", "#4ade80", "#86efac", "#bbf7d0", "#dcfce7", "#f0fdf4"][i % 7]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          {/* Matriz de consumo */}
          <div style={cardStyle}>
            <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a", marginBottom: "16px" }}>
              Matriz de consumo — {MESES[mes-1]} {anio}
              {categoriaId && ` (${categorias.find(c => c.id === categoriaId)?.nombre})`}
            </h3>
            {matriz.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#999" }}>No hay datos de consumo para el periodo seleccionado.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ backgroundColor: "#f9fafb" }}>
                      <th style={{ ...thStyle, position: "sticky", left: 0, backgroundColor: "#f9fafb", zIndex: 1 }}>Referencia</th>
                      <th style={{ ...thStyle, position: "sticky", left: 0, backgroundColor: "#f9fafb", zIndex: 1 }}>Producto</th>
                      {departamentos.map(dep => (
                        <th key={dep.id} style={{ ...thStyle, textAlign: "center", minWidth: "80px" }}>{dep.nombre}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matriz.map(row => (
                      <tr key={row.producto_id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                        <td style={{ ...tdStyle, fontWeight: 600, color: "#16a34a", position: "sticky", left: 0, backgroundColor: "#fff", zIndex: 1 }}>
                          {row.producto_referencia}
                        </td>
                        <td style={{ ...tdStyle, position: "sticky", left: 0, backgroundColor: "#fff", zIndex: 1 }}>
                          {row.producto_nombre}
                          <div style={{ fontSize: "11px", color: "#999" }}>{row.unidad_medida}</div>
                        </td>
                        {departamentos.map(dep => {
                          const key = `dep_${dep.id}`
                          const val = (row[key] as number) || 0
                          return (
                            <td key={dep.id} style={{ ...tdStyle, padding: "4px", textAlign: "center" }}>
                              <input
                                type="number"
                                min="0"
                                value={val}
                                onChange={e => handleCellChange(row.producto_id, dep.id, e.target.value)}
                                style={{
                                  width: "70px", padding: "6px", border: "1px solid #e5e7eb", borderRadius: "6px",
                                  textAlign: "center", fontSize: "13px",
                                }}
                              />
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Resumen por departamento */}
          <div style={cardStyle}>
            <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a", marginBottom: "16px" }}>
              Resumen por departamento — {anio}
            </h3>
            {resumen.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>No hay datos</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Departamento</th>
                      <th style={thStyle}>Salidas</th>
                      <th style={thStyle}>Consumo total</th>
                      <th style={thStyle}>Productos distintos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumen.map(r => (
                      <tr key={r.departamento_id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ ...tdStyle, fontWeight: 500 }}>{r.departamento_nombre}</td>
                        <td style={{ ...tdStyle }}>{r.total_salidas}</td>
                        <td style={{ ...tdStyle, fontWeight: 700, color: "#22c55e" }}>{r.total_cantidad.toLocaleString()}</td>
                        <td style={{ ...tdStyle, color: "#64748b" }}>{r.productos_distintos}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Registro de salidas */}
          <div style={cardStyle}>
            <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a", marginBottom: "16px" }}>
              Registro de salidas — {MESES[mes-1]} {anio}
              {departamentoFiltro && ` · ${departamentos.find(d => d.id === departamentoFiltro)?.nombre}`}
            </h3>
            {loadingSalidas ? (
              <div style={{ textAlign: "center", padding: "20px", color: "#94a3b8" }}>Cargando...</div>
            ) : salidasFiltradas.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>No hay registros para los filtros seleccionados.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Producto</th>
                      <th style={thStyle}>Departamento</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Cantidad</th>
                      <th style={thStyle}>Unidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salidasFiltradas.map(s => (
                      <tr key={`${s.producto_id}-${s.departamento_id}`} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 600, color: "#3b82f6" }}>{s.producto_referencia}</div>
                          <div style={{ fontSize: "11px", color: "#94a3b8" }}>{s.producto_nombre}</div>
                        </td>
                        <td style={{ ...tdStyle, color: "#475569" }}>{s.departamento_nombre}</td>
                        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: "#22c55e", fontVariantNumeric: "tabular-nums" }}>{s.cantidad.toLocaleString()}</td>
                        <td style={{ ...tdStyle, fontSize: "12px", color: "#94a3b8" }}>{s.unidad_medida}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// PÁGINA PRINCIPAL DE PRODUCTOS
// ============================================================================

export default function ProductsPage({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const [subPage, setSubPage] = useState<SubPage>("catalog")

  const SUB_TABS: { key: SubPage; label: string; icon: string }[] = [
    { key: "catalog", label: "Catálogo", icon: "📦" },
    { key: "register", label: "Registrar Salida", icon: "📝" },
    { key: "stats", label: "Estadísticas", icon: "📊" },
  ]

  return (
    <div style={{ minHeight: "calc(100vh - 64px)", backgroundColor: "#f8fafc", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <AppHeader page="productos" onNavigate={onNavigate} />

      {/* Sub-navegación */}
      <div style={{
        backgroundColor: "#fff",
        borderBottom: "1px solid #f1f5f9",
        padding: "0 32px",
        display: "flex",
        alignItems: "center",
        height: "52px",
        gap: "6px",
      }}>
        {SUB_TABS.map(tab => {
          const isActive = subPage === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setSubPage(tab.key)}
              style={{
                position: "relative",
                padding: "10px 18px",
                borderRadius: "10px",
                border: "none",
                backgroundColor: isActive ? "#f0fdf4" : "transparent",
                color: isActive ? "#15803d" : "#64748b",
                fontWeight: isActive ? 600 : 500,
                fontSize: "13px",
                cursor: "pointer",
                transition: "all 0.15s",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                letterSpacing: "0.01em",
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = "#f8fafc" }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = "transparent" }}
            >
              <span style={{ fontSize: "15px" }}>{tab.icon}</span>
              {tab.label}
            </button>
          )
        })}
      </div>

      <main style={{ maxWidth: "1280px", margin: "0 auto", padding: "24px" }}>
        {subPage === "catalog" && <VistaCatalogoMejorada />}
        {subPage === "register" && <VistaRegistrarSalida />}
        {subPage === "stats" && <VistaEstadisticas />}
      </main>
    </div>
  )
}

