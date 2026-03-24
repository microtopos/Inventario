import { useCallback, useEffect, useMemo, useState } from "react"
import AppHeader from "./AppHeader"
import type { Page } from "./AppHeader"
import { useToast } from "./Toast"
import { usePagination } from "./usePagination"
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import { endOfYear, format, startOfYear, subDays, subMonths } from "date-fns"
import {
  getConsumoPorDepartamento,
  getEntradasPorDepartamento,
  getMovimientos,
  getMovimientosCount,
  getStockPorDepartamento,
} from "./dashboardService"
import {
  getVehiculos, getGastoMensual, getResumenPorVehiculo,
} from "./gasolinaService"
import {
  getCategorias, getDepartamentosProd, getSalidas,
  getConsumoMensualPorDepartamento, getMatrizConsumo, getResumenPorDepartamento,
  upsertSalida,
  type CategoriaProducto, type DepartamentoProd, type ConsumoMensualDepartamento, type MatrizConsumo, type ResumenDepartamento, type SalidaProducto,
} from "./productosService"
import { cardStyle, thStyle, tdStyle, sectionTitleStyle, dateInputStyle, inputStyle, btnStyle } from "./styles"

const MESES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
]

function formatEuro(n: number): string {
  return n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"
}

// ============================================================================
// ROPA STATS COMPONENT (former DashboardPage content)
// ============================================================================

type RangePreset = "7d" | "1m" | "3m" | "year" | "all"

function toISODate(d: Date): string {
  return format(d, "yyyy-MM-dd")
}

function fmtFechaHora(fecha: string): string {
  if (!fecha) return "—"
  try {
    return new Date(fecha).toLocaleString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return String(fecha)
  }
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

function RopaStats() {
  const [desde, setDesde] = useState<string>("")
  const [hasta, setHasta] = useState<string>("")
  const [preset, setPreset] = useState<RangePreset>("all")

  const [stock, setStock] = useState<{ departamento: string; stock: number }[]>([])
  const [entradas, setEntradas] = useState<{ mes: string; departamento: string; total: number }[]>([])
  const [consumo, setConsumo] = useState<{ mes: string; departamento: string; total: number }[]>([])
  const [chartsLoading, setChartsLoading] = useState(false)

  const movPagination = usePagination<any>({
    fetchFn: useCallback(async (pageSize, offset) => {
      const d = desde?.trim() || undefined
      const h = hasta?.trim() || undefined
      const [items, total] = await Promise.all([
        getMovimientos(d, h, pageSize, offset),
        getMovimientosCount(d, h),
      ])
      return [items, total]
    }, [desde, hasta]),
    defaultPageSize: 25,
    deps: [desde, hasta],
  })

  function applyPreset(p: RangePreset) {
    setPreset(p)
    const now = new Date()
    if (p === "all") { setDesde(""); setHasta(""); return }
    if (p === "7d") { setDesde(toISODate(subDays(now, 6))); setHasta(toISODate(now)); return }
    if (p === "1m") { setDesde(toISODate(subMonths(now, 1))); setHasta(toISODate(now)); return }
    if (p === "3m") { setDesde(toISODate(subMonths(now, 3))); setHasta(toISODate(now)); return }
    if (p === "year") {
      setDesde(toISODate(startOfYear(now)))
      setHasta(toISODate(endOfYear(now) > now ? now : endOfYear(now)))
    }
  }

  useEffect(() => {
    applyPreset("all")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    async function loadCharts() {
      setChartsLoading(true)
      try {
        const d = desde?.trim() || undefined
        const h = hasta?.trim() || undefined
        const [s, e, c] = await Promise.all([
          getStockPorDepartamento(),
          getEntradasPorDepartamento(d, h),
          getConsumoPorDepartamento(d, h),
        ])
        setStock(s)
        setEntradas(e)
        setConsumo(c)
      } finally {
        setChartsLoading(false)
      }
    }
    loadCharts()
  }, [desde, hasta])

  const entradasPivot = useMemo(() => pivotByMes(entradas), [entradas])
  const consumoPivot = useMemo(() => pivotByMes(consumo), [consumo])

  const totalStock = useMemo(() => stock.reduce((a, r) => a + r.stock, 0), [stock])
  const totalConsumo = useMemo(() => sumPivot(consumoPivot), [consumoPivot])
  const totalEntradas = useMemo(() => sumPivot(entradasPivot), [entradasPivot])

  const loading = chartsLoading || movPagination.loading

  const presets: { key: RangePreset; label: string }[] = [
    { key: "7d", label: "7 días" },
    { key: "1m", label: "1 mes" },
    { key: "3m", label: "3 meses" },
    { key: "year", label: "Este año" },
    { key: "all", label: "Todo" },
  ]

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "28px 24px" }}>

      {/* HEADER ROW */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h2 style={{ fontSize: "17px", fontWeight: 700, margin: 0, color: "#111", letterSpacing: "-0.2px" }}>
            Estadísticas
          </h2>
          <div style={{ fontSize: "13px", color: "#888", marginTop: "3px" }}>
            Overview del inventario y movimientos
          </div>
        </div>

        {/* RANGE FILTER */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          {presets.map(p => (
            <button
              key={p.key}
              onClick={() => applyPreset(p.key)}
              style={{
                padding: "6px 14px",
                borderRadius: "7px",
                border: `1px solid ${preset === p.key ? "#2563eb" : "#e0e0e0"}`,
                backgroundColor: preset === p.key ? "#eff6ff" : "#fff",
                color: preset === p.key ? "#2563eb" : "#666",
                fontSize: "13px",
                fontWeight: preset === p.key ? 700 : 400,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {p.label}
            </button>
          ))}
          <div style={{ display: "flex", gap: "8px", alignItems: "center", marginLeft: "8px" }}>
            <span style={{ fontSize: "13px", color: "#888" }}>Desde:</span>
            <input
              type="date"
              value={desde}
              onChange={e => setDesde(e.target.value)}
              style={dateInputStyle}
            />
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ fontSize: "13px", color: "#888" }}>Hasta:</span>
            <input
              type="date"
              value={hasta}
              onChange={e => setHasta(e.target.value)}
              style={dateInputStyle}
            />
          </div>
        </div>
      </div>

      {/* LOADING OVERLAY */}
      {loading && (
        <div style={{
          position: "fixed", inset: 0, backgroundColor: "rgba(255,255,255,0.6)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 50, fontSize: "14px", color: "#666",
        }}>
          Cargando datos...
        </div>
      )}

      {/* CHARTS GRID */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px", marginBottom: "24px" }}>
        {/* Stock por Departamento */}
        <div style={{ ...cardStyle, gridColumn: "span 1" }}>
          <div style={sectionTitleStyle}>Stock por Departamento</div>
          <div style={{ height: "240px", marginTop: "12px" }}>
            {stock.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stock.map((s) => ({
                      name: s.departamento,
                      value: s.stock,
                      pct: ((s.stock / totalStock) * 100).toFixed(1),
                    }))}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={40}
                    label={({ name, pct }) => `${name} (${pct}%)`}
                    labelLine={false}
                  >
                    {stock.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#999" }}>
                No hay datos
              </div>
            )}
          </div>
          <div style={{ fontSize: "13px", color: "#888", textAlign: "center", marginTop: "8px" }}>
            Total: <strong style={{ color: "#111" }}>{totalStock.toLocaleString()}</strong> prendas
          </div>
        </div>

        {/* Entradas por Departamento */}
        <div style={{ ...cardStyle, gridColumn: "span 1" }}>
          <div style={sectionTitleStyle}>Entradas por Departamento</div>
          <div style={{ height: "240px", marginTop: "12px" }}>
            {entradasPivot.data.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={entradasPivot.data} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "#888" }} />
                  <YAxis tickFormatter={v => v.toLocaleString()} tick={{ fontSize: 12, fill: "#888" }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="total" name="Entradas" radius={[4, 4, 0, 0]}>
                    {entradasPivot.departments.map((dept, i) => (
                      <Cell key={dept} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#999" }}>
                No hay datos
              </div>
            )}
          </div>
          <div style={{ fontSize: "13px", color: "#888", textAlign: "center", marginTop: "8px" }}>
            Total: <strong style={{ color: "#111" }}>{totalEntradas.toLocaleString()}</strong> entradas
          </div>
        </div>

        {/* Consumo por Departamento */}
        <div style={{ ...cardStyle, gridColumn: "span 1" }}>
          <div style={sectionTitleStyle}>Consumo por Departamento</div>
          <div style={{ height: "240px", marginTop: "12px" }}>
            {consumoPivot.data.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={consumoPivot.data} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "#888" }} />
                  <YAxis tickFormatter={v => v.toLocaleString()} tick={{ fontSize: 12, fill: "#888" }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="total" name="Consumo" radius={[4, 4, 0, 0]}>
                    {consumoPivot.departments.map((dept, i) => (
                      <Cell key={dept} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#999" }}>
                No hay datos
              </div>
            )}
          </div>
          <div style={{ fontSize: "13px", color: "#888", textAlign: "center", marginTop: "8px" }}>
            Total: <strong style={{ color: "#111" }}>{totalConsumo.toLocaleString()}</strong> consumos
          </div>
        </div>

        {/* Leyenda de colores por departamento */}
        <div style={{ gridColumn: "span 1", display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: "12px" }}>
          {entradasPivot.departments.map((dept, i) => (
            <div key={dept} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#555" }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: COLORS[i % COLORS.length] }} />
              {dept}
            </div>
          ))}
        </div>
      </div>

      {/* MOVIMIENTOS RECIENTES */}
      <div style={cardStyle}>
        <div style={sectionTitleStyle}>Movimientos Recientes</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "12px" }}>
            <thead>
              <tr style={{ backgroundColor: "#fafafa", borderBottom: "1px solid #e0e0e0" }}>
                {["Fecha", "Producto", "Talla", "Cambio", "Origen", "Departamento"].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {movPagination.items.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ ...tdStyle, textAlign: "center", padding: "40px", color: "#999" }}>
                    No hay movimientos
                  </td>
                </tr>
              ) : (
                movPagination.items.map((m: any) => {
                  const isEntrada = Number(m.cambio) > 0
                  const origen = m.origen === "pedido" ? "📦 Pedido" : m.origen ? "✏️ Manual" : "—"
                  return (
                    <tr key={m.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                      <td style={tdStyle}>{fmtFechaHora(m.fecha)}</td>
                      <td style={{ ...tdStyle, fontWeight: 500, color: "#111" }}>{m.producto_nombre}</td>
                      <td style={{ ...tdStyle, fontFamily: "monospace", color: "#555" }}>{m.talla}</td>
                      <td style={{ ...tdStyle, color: isEntrada ? "#16a34a" : "#dc2626", fontWeight: 600 }}>
                        {isEntrada ? "+" : ""}{m.cambio}
                      </td>
                      <td style={{ ...tdStyle, fontSize: "13px", color: "#666" }}>{origen}</td>
                      <td style={{ ...tdStyle, fontSize: "13px", color: "#555" }}>{m.departamento_nombre}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION */}
        {movPagination.totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", gap: "6px", marginTop: "16px" }}>
            {Array.from({ length: movPagination.totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => movPagination.goToPage(page)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border: "1px solid",
                  borderColor: movPagination.page === page ? "#2563eb" : "#e5e7eb",
                  backgroundColor: movPagination.page === page ? "#eff6ff" : "#fff",
                  color: movPagination.page === page ? "#2563eb" : "#666",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                {page}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// GASOLINA STATS COMPONENT (extracted from GasolinaPage's VistaEstadisticas)
// ============================================================================

function GasolinaStats() {
  const [vehiculos, setVehiculos] = useState<{ id: number; matricula: string; nombre: string; activo: number }[]>([])
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [gastoMensual, setGastoMensual] = useState<any[]>([])
  const [resumenes, setResumenes] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getVehiculos(true).then(setVehiculos)
  }, [])

  useEffect(() => {
    const desde = `${anio}-01-01`
    const hasta = `${anio}-12-31`

    setLoading(true)
    Promise.all([
      getGastoMensual({ fecha_desde: desde, fecha_hasta: hasta }),
      getResumenPorVehiculo({ fecha_desde: desde, fecha_hasta: hasta }),
    ]).then(([gasto, res]) => {
      const porMes: Record<number, any> = {}
      for (let m = 1; m <= 12; m++) {
        porMes[m] = { mes: MESES[m - 1] }
      }
      for (const row of gasto) {
        porMes[row.mes][row.vehiculo_nombre] = row.total
      }
      setGastoMensual(Object.values(porMes))
      setResumenes(res)
    }).finally(() => setLoading(false))
  }, [anio])

  const aniosPosibles = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)
  const gastoTotal = resumenes.reduce((s, r) => s + (r.gasto_total ?? 0), 0)

  if (loading) {
    return (
      <div style={{
        position: "fixed", inset: 0, backgroundColor: "rgba(255,255,255,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 50, fontSize: "14px", color: "#666",
      }}>
        Cargando datos...
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* Selector de año */}
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <span style={{ fontSize: "13px", color: "#888", fontWeight: 500 }}>Año:</span>
        {aniosPosibles.map(a => (
          <button
            key={a}
            onClick={() => setAnio(a)}
            style={{
              padding: "6px 14px",
              borderRadius: "7px",
              border: `1px solid ${anio === a ? "#ea580c" : "#e0e0e0"}`,
              backgroundColor: anio === a ? "#fff7ed" : "#fff",
              color: anio === a ? "#ea580c" : "#666",
              fontSize: "13px",
              fontWeight: anio === a ? 700 : 400,
              cursor: "pointer",
            }}
          >
            {a}
          </button>
        ))}
      </div>

      {/* Tarjetas resumen */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
        {[
          { label: "Gasto total", value: formatEuro(gastoTotal) },
          { label: "Vehículos activos", value: vehiculos.filter(v => v.activo === 1).length },
          { label: "Media mensual", value: formatEuro(gastoTotal / 12) },
        ].map(card => (
          <div key={card.label} style={{ backgroundColor: "#fff", border: "1px solid #e0e0e0", borderRadius: "10px", padding: "20px" }}>
            <div style={{ fontSize: "12px", color: "#888", marginBottom: "4px" }}>{card.label}</div>
            <div style={{ fontSize: "24px", fontWeight: 700, color: "#111" }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Gráfico líneas */}
      <div style={{ backgroundColor: "#fff", border: "1px solid #e0e0e0", borderRadius: "10px", padding: "20px" }}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#111", marginBottom: "16px" }}>
          Evolución mensual del gasto — {anio}
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={gastoMensual} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "#888" }} />
            <YAxis tickFormatter={v => `${v}€`} tick={{ fontSize: 12, fill: "#888" }} />
            <Tooltip formatter={(v: number) => formatEuro(v)} />
            <Legend />
            {vehiculos.map((v, i) => (
              <Line
                key={v.id}
                type="monotone"
                dataKey={v.nombre}
                stroke={COLORES_VEHICULO[i % COLORES_VEHICULO.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Gráfico barras */}
      <div style={{ backgroundColor: "#fff", border: "1px solid #e0e0e0", borderRadius: "10px", padding: "20px" }}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#111", marginBottom: "16px" }}>
          Gasto total por vehículo — {anio}
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart
            data={resumenes.filter(r => r.gasto_total > 0)}
            margin={{ top: 4, right: 16, bottom: 0, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="vehiculo_nombre" tick={{ fontSize: 12, fill: "#888" }} />
            <YAxis tickFormatter={v => `${v}€`} tick={{ fontSize: 12, fill: "#888" }} />
            <Tooltip formatter={(v: number) => formatEuro(v)} />
            <Bar dataKey="gasto_total" name="Gasto total" radius={[4, 4, 0, 0]}>
              {resumenes.filter(r => r.gasto_total > 0).map((_, i) => (
                <rect key={i} fill={COLORES_VEHICULO[i % COLORES_VEHICULO.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tabla resumen */}
      {resumenes.length > 0 && (
        <div style={{ backgroundColor: "#fff", border: "1px solid #e0e0e0", borderRadius: "10px", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#fafafa", borderBottom: "1px solid #e0e0e0" }}>
                {["Vehículo", "Matrícula", "Repostajes", "Gasto total", "Media/repostaje", "Último repostaje"].map(h => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: "11px", fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resumenes.map((r, i) => (
                <tr key={r.vehiculo_id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: 600, color: "#111" }}>
                      <span style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: COLORES_VEHICULO[i % COLORES_VEHICULO.length], flexShrink: 0 }} />
                      {r.vehiculo_nombre}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: "13px", color: "#888", fontFamily: "monospace" }}>{r.vehiculo_matricula}</td>
                  <td style={{ padding: "12px 16px", fontSize: "14px", color: "#555" }}>{r.total_repostajes ?? 0}</td>
                  <td style={{ padding: "12px 16px", fontSize: "15px", fontWeight: 700, color: "#ea580c" }}>{formatEuro(r.gasto_total ?? 0)}</td>
                  <td style={{ padding: "12px 16px", fontSize: "13px", color: "#555" }}>{r.total_repostajes > 0 ? formatEuro(r.gasto_medio ?? 0) : "—"}</td>
                  <td style={{ padding: "12px 16px", fontSize: "13px", color: "#888" }}>
                    {r.ultimo_repostaje
                      ? new Date(r.ultimo_repostaje + "T00:00:00").toLocaleDateString("es-ES")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// GasolinaStats constants
const COLORES_VEHICULO = [
  "#ea580c", "#2563eb", "#16a34a", "#9333ea",
  "#db2777", "#0891b2", "#ca8a04", "#dc2626",
]

// ============================================================================
// PRODUCTOS STATS COMPONENT
// ============================================================================

function ProductosStats() {
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
// MAIN STATISTICS PAGE
// ============================================================================

export default function StatisticsPage({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const [activeTab, setActiveTab] = useState<"ropa" | "gasolina" | "productos">("ropa")

  return (
    <div style={{ minHeight: "calc(100vh - 64px)", backgroundColor: "#f5f5f5" }}>
      <AppHeader page="dashboard" onNavigate={onNavigate} />

      {/* Tab Navigation */}
      <div style={{
        backgroundColor: "#fff",
        borderBottom: "1px solid #e0e0e0",
        padding: "0 32px",
        display: "flex",
        alignItems: "center",
        height: "48px",
        gap: "4px",
      }}>
        {[
          { key: "ropa", label: "👕 Ropa", accent: "#2563eb" },
          { key: "gasolina", label: "⛽ Gasolina", accent: "#ea580c" },
          { key: "productos", label: "🧴 Productos", accent: "#16a34a" },
        ].map(tab => {
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as "ropa" | "gasolina" | "productos")}
              style={{
                position: "relative",
                padding: "8px 16px",
                borderRadius: "6px",
                border: "none",
                backgroundColor: "transparent",
                color: isActive ? tab.accent : "#666",
                fontWeight: isActive ? 600 : 500,
                fontSize: "14px",
                cursor: "pointer",
                transition: "color 0.15s, background-color 0.15s",
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  const hoverColor = tab.key === "ropa" ? "#eff6ff" : tab.key === "gasolina" ? "#fff7ed" : "#f0fdf4"
                  e.currentTarget.style.backgroundColor = hoverColor
                }
              }}
              onMouseLeave={e => {
                if (!isActive) e.currentTarget.style.backgroundColor = "transparent"
              }}
            >
              {tab.label}
              {isActive && (
                <span style={{
                  position: "absolute",
                  bottom: "2px",
                  left: "16px",
                  right: "16px",
                  height: "2px",
                  backgroundColor: tab.accent,
                  borderRadius: "2px",
                }} />
              )}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "28px 24px" }}>
        {activeTab === "ropa" && <RopaStats />}
        {activeTab === "gasolina" && <GasolinaStats />}
        {activeTab === "productos" && <ProductosStats />}
      </main>
    </div>
  )
}
