import { useState, useEffect, useMemo, useCallback } from "react"
import AppHeader from "./AppHeader"
import type { Page } from "./AppHeader"
import { useConfirm } from "./ConfirmDialog"
import { useToast } from "./Toast"
import {
  getCategorias,
  getProductos,
  getDepartamentosProd,
  crearProducto,
  actualizarProducto,
  desactivarProducto,
  reactivarProducto,
  upsertSalida,
  getConsumoMensualPorDepartamento,
  getMatrizConsumo,
  getResumenPorDepartamento,
  getSalidas,
  type CategoriaProducto,
  type ProductoAlmacen,
  type DepartamentoProd,
  type ConsumoMensualDepartamento,
  type MatrizConsumo,
  type ResumenDepartamento,
  type SalidaProducto,
} from "./productosService"
import {
  ResponsiveContainer, BarChart, Bar, CartesianGrid, Cell, Legend, Pie, PieChart, Tooltip, XAxis, YAxis,
} from "recharts"
import { cardStyle, sectionTitleStyle, dateInputStyle } from "./styles"

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

const thStyle: React.CSSProperties = {
  padding: "12px 16px",
  textAlign: "left",
  backgroundColor: "#f9fafb",
  borderBottom: "1px solid #e5e7eb",
  fontWeight: 600,
  color: "#666",
  fontSize: "12px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
}

const tdStyle: React.CSSProperties = {
  padding: "12px 16px",
  color: "#444",
  fontSize: "14px",
}


// ============================================================================
// COMPONENT: MODAL PRODUCTO
// ============================================================================

function ModalProducto({
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
  const [referencia, setReferencia] = useState(producto?.referencia ?? "")
  const [nombre, setNombre] = useState(producto?.nombre ?? "")
  const [categoriaId, setCategoriaId] = useState<number>(producto?.categoria_id ?? categorias[0]?.id ?? 0)
  const [unidadMedida, setUnidadMedida] = useState(producto?.unidad_medida ?? "")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (categorias.length > 0 && !producto) {
      setCategoriaId(categorias[0].id)
    }
  }, [categorias, producto])

  async function handleSubmit() {
    if (!referencia.trim() || !nombre.trim() || !unidadMedida.trim()) {
      toast.error("Error", "Todos los campos son obligatorios")
      return
    }
    setSaving(true)
    try {
      if (producto) {
        await actualizarProducto(producto.id, {
          referencia: referencia.trim(),
          nombre: nombre.trim(),
          categoria_id: categoriaId,
          unidad_medida: unidadMedida.trim(),
        })
        toast.success("Producto actualizado")
      } else {
        await crearProducto(referencia.trim(), nombre.trim(), categoriaId, unidadMedida.trim())
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

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.35)", zIndex: 300 }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        backgroundColor: "#fff", borderRadius: "14px", width: "420px",
        maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
        zIndex: 301, overflow: "hidden",
      }}>
        <div style={{ height: "4px", backgroundColor: "#16a34a" }} />
        <div style={{ padding: "24px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 20px" }}>
            {producto ? "Editar producto" : "Nuevo producto"}
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", display: "block", marginBottom: "6px" }}>
                Referencia
              </label>
              <input
                type="text"
                value={referencia}
                onChange={e => setReferencia(e.target.value)}
                style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                placeholder="Ej: BOLSA-001"
              />
            </div>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", display: "block", marginBottom: "6px" }}>
                Nombre / Descripción
              </label>
              <input
                type="text"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                placeholder="Ej: Bolsa de basura 50L"
              />
            </div>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", display: "block", marginBottom: "6px" }}>
                Categoría
              </label>
              <select
                value={categoriaId}
                onChange={e => setCategoriaId(Number(e.target.value))}
                style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
              >
                {categorias.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", display: "block", marginBottom: "6px" }}>
                Unidad de medida
              </label>
              <input
                type="text"
                value={unidadMedida}
                onChange={e => setUnidadMedida(e.target.value)}
                style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                placeholder="Ej: UNIDAD, CAJA, LITRO, KG"
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", marginTop: "24px", justifyContent: "flex-end" }}>
            <button
              onClick={onClose}
              style={{ ...btnStyle, backgroundColor: "#fff", border: "1px solid #ddd", color: "#666" }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              style={{ ...btnStyle, backgroundColor: saving ? "#f5f5f5" : "#16a34a", color: saving ? "#aaa" : "#fff", border: "none", opacity: saving ? 0.7 : 1 }}
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ============================================================================
// SUB-VIEW: CATÁLOGO DE PRODUCTOS
// ============================================================================

function VistaCatalogo() {
  const toast = useToast()
  const { confirm } = useConfirm()
  const [categorias, setCategorias] = useState<CategoriaProducto[]>([])
  const [productos, setProductos] = useState<ProductoAlmacen[]>([])
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState<"nuevo" | ProductoAlmacen | null>(null)
  const [filterCat, setFilterCat] = useState<number | "">("")

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [cats, prods] = await Promise.all([
        getCategorias(),
        getProductos(false), // get all including inactive
      ])
      setCategorias(cats)
      setProductos(prods)
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  const productosFiltrados = filterCat === "" ? productos : productos.filter(p => p.categoria_id === filterCat)

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#111", margin: 0 }}>Catálogo de Productos</h2>
        <div style={{ display: "flex", gap: "8px" }}>
          <select
            value={filterCat}
            onChange={e => setFilterCat(e.target.value === "" ? "" : Number(e.target.value))}
            style={{ ...inputStyle, minWidth: "200px" }}
          >
            <option value="">Todas las categorías</option>
            {categorias.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.nombre}</option>
            ))}
          </select>
          <button
            onClick={() => setModal("nuevo")}
            style={{ ...btnStyle, backgroundColor: "#16a34a", color: "#fff", border: "none", display: "flex", alignItems: "center", gap: "6px" }}
          >
            <span>+</span> Nuevo producto
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: "40px", textAlign: "center", color: "#888" }}>Cargando productos...</div>
      ) : (
        <div style={{ backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: "12px", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ backgroundColor: "#f9fafb" }}>
              <tr>
                {["Referencia", "Nombre", "Categoría", "Unidad", "Estado", "Acciones"].map(h => (
                  <th key={h} style={{ ...thStyle, padding: "12px 16px", fontSize: "12px", fontWeight: 600, color: "#666", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "left" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {productosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ ...tdStyle, textAlign: "center", padding: "40px", color: "#999" }}>
                    No hay productos registrados
                  </td>
                </tr>
              ) : (
                productosFiltrados.map(p => (
                  <tr key={p.id} style={{ borderBottom: "1px solid #f0f0f0", transition: "background-color 0.15s" }} onMouseEnter={e => e.currentTarget.style.backgroundColor = "#f9fafb"} onMouseLeave={e => e.currentTarget.style.backgroundColor = ""}>
                    <td style={{ ...tdStyle, fontWeight: 500, color: "#111" }}>{p.referencia}</td>
                    <td style={{ ...tdStyle, color: "#555" }}>{p.nombre}</td>
                    <td style={{ ...tdStyle, color: "#666" }}>{p.categoria_nombre}</td>
                    <td style={{ ...tdStyle, fontSize: "13px", fontStyle: "italic" }}>{p.unidad_medida}</td>
                    <td style={{ ...tdStyle }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: "999px",
                        backgroundColor: p.activo ? "#dcfce7" : "#fee2e2",
                        color: p.activo ? "#16a34a" : "#dc2626",
                        fontSize: "12px", fontWeight: 600
                      }}>
                        {p.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td style={{ ...tdStyle }}>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          onClick={() => setModal(p)}
                          style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #e5e7eb", backgroundColor: "#fff", color: "#444", fontSize: "12px", cursor: "pointer", transition: "all 0.15s" }}
                          onMouseEnter={e => e.currentTarget.style.borderColor = "#16a34a"}
                          onMouseLeave={e => e.currentTarget.style.borderColor = "#e5e7eb"}
                        >
                          Editar
                        </button>
                        <button
                          onClick={async () => {
                            if (await confirm(p.activo ? "¿Desactivar producto?" : "¿Reactivar producto?")) {
                              try {
                                if (p.activo) {
                                  await desactivarProducto(p.id)
                                  toast.success("Producto desactivado")
                                } else {
                                  await reactivarProducto(p.id)
                                  toast.success("Producto reactivado")
                                }
                                loadData()
                              } catch (e: any) {
                                toast.error("Error", e?.message ?? String(e))
                              }
                            }
                          }}
                          style={{
                            padding: "6px 12px", borderRadius: "6px", border: "1px solid", backgroundColor: "#fff",
                            color: p.activo ? "#dc2626" : "#16a34a",
                            borderColor: p.activo ? "#fca5a5" : "#a7f3d0",
                            fontSize: "12px", cursor: "pointer",
                          }}
                        >
                          {p.activo ? "Desactivar" : "Reactivar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <ModalProducto
          producto={modal === "nuevo" ? null : modal}
          categorias={categorias}
          onClose={() => setModal(null)}
          onSaved={loadData}
        />
      )}
    </div>
  )
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

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto" }}>
      <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#111", marginBottom: "16px" }}>
        Registrar Salida de Producto
      </h2>

      <form onSubmit={handleSubmit} style={{ backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
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
            <select
              value={departamentoId}
              onChange={e => setDepartamentoId(Number(e.target.value))}
              style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
            >
              {departamentos.map(d => (
                <option key={d.id} value={d.id}>{d.nombre}</option>
              ))}
            </select>
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

        <div style={{ marginTop: "8px", display: "flex", justifyContent: "flex-end" }}>
          <button
            type="submit"
            disabled={saving}
            style={{ ...btnStyle, backgroundColor: saving ? "#f5f5f5" : "#16a34a", color: saving ? "#aaa" : "#fff", border: "none", padding: "10px 24px", fontSize: "14px", fontWeight: 600 }}
          >
            {saving ? "Guardando..." : "Guardar salida"}
          </button>
        </div>
      </form>
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
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    Promise.all([getDepartamentosProd(), getCategorias()]).then(([depts, cats]) => {
      setDepartamentos(depts)
      setCategorias(cats)
    }).catch(e => {
      toast.error("Error", e?.message ?? String(e))
    })
  }, [])

  useEffect(() => {
    loadStats()
  }, [anio, mes, categoriaId, departamentoFiltro])

  async function loadStats() {
    setLoading(true)
    try {
      const [matrizData, consumoData, resumenData, salidasData] = await Promise.all([
        getMatrizConsumo(anio, mes, categoriaId === "" ? undefined : Number(categoriaId)),
        getConsumoMensualPorDepartamento({ anio_desde: anio, anio_hasta: anio }),
        getResumenPorDepartamento({ anio, categoria_id: categoriaId === "" ? undefined : Number(categoriaId) }),
        getSalidas({
          anio,
          mes,
          departamento_id: departamentoFiltro === "" ? undefined : Number(departamentoFiltro),
          categoria_id: categoriaId === "" ? undefined : Number(categoriaId),
        }),
      ])
      setMatriz(matrizData.matriz)
      setConsumoMensual(consumoData)
      setResumen(resumenData)
      setSalidasFiltradas(salidasData)
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    } finally {
      setLoading(false)
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
        <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#111", margin: 0 }}>Estadísticas de Productos</h2>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <label style={{ fontSize: "13px", color: "#666" }}>Año:</label>
            <select value={anio} onChange={e => setAnio(Number(e.target.value))} style={{ ...inputStyle, width: "90px" }}>
              {aniosPosibles.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <label style={{ fontSize: "13px", color: "#666" }}>Mes:</label>
            <select value={mes} onChange={e => setMes(Number(e.target.value))} style={{ ...inputStyle, width: "100px" }}>
              {MESES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <label style={{ fontSize: "13px", color: "#666" }}>Categoría:</label>
            <select value={categoriaId} onChange={e => setCategoriaId(e.target.value === "" ? "" : Number(e.target.value))} style={{ ...inputStyle, width: "180px" }}>
              <option value="">Todas</option>
              {categorias.map(cat => <option key={cat.id} value={cat.id}>{cat.nombre}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <label style={{ fontSize: "13px", color: "#666" }}>Departamento:</label>
            <select value={departamentoFiltro} onChange={e => setDepartamentoFiltro(e.target.value === "" ? "" : Number(e.target.value))} style={{ ...inputStyle, width: "180px" }}>
              <option value="">Todos</option>
              {departamentos.map(dep => <option key={dep.id} value={dep.id}>{dep.nombre}</option>)}
            </select>
          </div>
          <button onClick={loadStats} style={{ ...btnStyle, backgroundColor: "#16a34a", color: "#fff", border: "none", fontSize: "13px" }}>
            ↻ Actualizar
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: "60px", textAlign: "center", color: "#888" }}>Cargando estadísticas...</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* Resumen cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
            <div style={cardStyle}>
              <div style={{ fontSize: "12px", color: "#888", marginBottom: "4px" }}>Productos con salida</div>
              <div style={{ fontSize: "24px", fontWeight: 700, color: "#111" }}>{matriz.length}</div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: "12px", color: "#888", marginBottom: "4px" }}>Departamentos</div>
              <div style={{ fontSize: "24px", fontWeight: 700, color: "#111" }}>{departamentos.length}</div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: "12px", color: "#888", marginBottom: "4px" }}>Consumo total (Año {anio})</div>
              <div style={{ fontSize: "24px", fontWeight: 700, color: "#111" }}>
                {resumen.reduce((sum, r) => sum + r.total_cantidad, 0).toLocaleString()} unidades
              </div>
            </div>
          </div>

          {/* Gráfico de pastel: Distribución de consumo por departamento */}
          {resumen.length > 0 && (
            <div style={cardStyle}>
              <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#111", marginBottom: "16px", margin: 0 }}>
                Distribución de consumo por departamento — {anio}
              </h3>
              <div style={{ height: "300px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={resumen.map(r => ({
                        name: r.departamento_nombre,
                        value: r.total_cantidad,
                        pct: ((r.total_cantidad / resumen.reduce((sum, r) => sum + r.total_cantidad, 0)) * 100).toFixed(1),
                      }))}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      innerRadius={40}
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

          {/* Gráfico de barras: Consumo mensual por departamento */}
          {barChartData.length > 0 && (
            <div style={cardStyle}>
              <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#111", marginBottom: "16px", margin: 0 }}>
                Consumo mensual por departamento — {anio}
              </h3>
              <div style={{ height: "300px" }}>
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

          {/* Matriz de consumo editable */}
          <div style={cardStyle}>
            <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#111", marginBottom: "16px", margin: 0 }}>
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

          {/* Tabla resumen por departamento */}
          <div style={cardStyle}>
            <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#111", marginBottom: "16px", margin: 0 }}>
              Resumen por departamento — {anio}
            </h3>
            {resumen.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#999" }}>No hay datos</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ backgroundColor: "#f9fafb" }}>
                      <th style={thStyle}>Departamento</th>
                      <th style={thStyle}>Salidas registradas</th>
                      <th style={thStyle}>Consumo total</th>
                      <th style={thStyle}>Productos distintos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumen.map(r => (
                      <tr key={r.departamento_id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                        <td style={{ ...tdStyle, fontWeight: 500 }}>{r.departamento_nombre}</td>
                        <td style={{ ...tdStyle }}>{r.total_salidas}</td>
                        <td style={{ ...tdStyle, fontWeight: 600, color: "#16a34a" }}>{r.total_cantidad.toLocaleString()}</td>
                        <td style={{ ...tdStyle }}>{r.productos_distintos}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Lista de productos con consumo mensual */}
          <div style={cardStyle}>
            <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#111", marginBottom: "16px", margin: 0 }}>
              Consumo mensual por producto — {MESES[mes-1]} {anio}
              {departamentoFiltro && ` — ${departamentos.find(d => d.id === departamentoFiltro)?.nombre}`}
            </h3>
            {salidasFiltradas.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#999" }}>No hay registros de consumo para el periodo seleccionado.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ backgroundColor: "#f9fafb" }}>
                      <th style={thStyle}>Producto</th>
                      <th style={thStyle}>Departamento</th>
                      <th style={thStyle}>Cantidad</th>
                      <th style={thStyle}>Unidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salidasFiltradas.map(s => (
                      <tr key={`${s.producto_id}-${s.departamento_id}`} style={{ borderBottom: "1px solid #f0f0f0" }}>
                        <td style={{ ...tdStyle }}>
                          <div style={{ fontWeight: 500 }}>{s.producto_referencia}</div>
                          <div style={{ fontSize: "11px", color: "#999" }}>{s.producto_nombre}</div>
                        </td>
                        <td style={{ ...tdStyle }}>{s.departamento_nombre}</td>
                        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, color: "#16a34a" }}>{s.cantidad.toLocaleString()}</td>
                        <td style={{ ...tdStyle, fontSize: "12px", color: "#666" }}>{s.unidad_medida}</td>
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

  const SUB_TABS: { key: SubPage; label: string }[] = [
    { key: "catalog", label: "📦 Catálogo" },
    { key: "register", label: "📝 Registrar Salida" },
    { key: "stats", label: "📊 Estadísticas" },
  ]

  return (
    <div style={{ minHeight: "calc(100vh - 64px)", backgroundColor: "#f5f5f5", fontFamily: "system-ui, sans-serif" }}>
      <AppHeader page="productos" onNavigate={onNavigate} />

      {/* Sub-navegación */}
      <div style={{ backgroundColor: "#fff", borderBottom: "1px solid #e0e7eb", padding: "0 32px", display: "flex", alignItems: "center", height: "48px", gap: "4px" }}>
        {SUB_TABS.map(tab => {
          const isActive = subPage === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setSubPage(tab.key)}
              style={{
                position: "relative",
                padding: "8px 16px",
                borderRadius: "6px",
                border: "none",
                backgroundColor: "transparent",
                color: isActive ? "#16a34a" : "#666",
                fontWeight: isActive ? 600 : 500,
                fontSize: "14px",
                cursor: "pointer",
                transition: "color 0.15s, background-color 0.15s",
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = "#f0fdf4" }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = "transparent" }}
            >
              {tab.label}
              {isActive && (
                <span style={{
                  position: "absolute",
                  bottom: "2px",
                  left: "16px",
                  right: "16px",
                  height: "2px",
                  backgroundColor: "#16a34a",
                  borderRadius: "2px",
                }} />
              )}
            </button>
          )
        })}
      </div>

      <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "24px" }}>
        {subPage === "catalog" && <VistaCatalogo />}
        {subPage === "register" && <VistaRegistrarSalida />}
        {subPage === "stats" && <VistaEstadisticas />}
      </main>
    </div>
  )
}

