import { useCallback, useEffect, useMemo, useState } from "react"
import AppHeader from "./AppHeader"
import type { Page } from "./AppHeader"
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
import { cardStyle, thStyle, tdStyle, sectionTitleStyle, dateInputStyle } from "./styles"

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
const MESES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
]

const COLORES_VEHICULO = [
  "#ea580c", "#2563eb", "#16a34a", "#9333ea",
  "#db2777", "#0891b2", "#ca8a04", "#dc2626",
]

function formatEuro(n: number) {
  return n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"
}

// ============================================================================
// MAIN STATISTICS PAGE
// ============================================================================

export default function StatisticsPage({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const [activeTab, setActiveTab] = useState<"ropa" | "gasolina">("ropa")

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
          { key: "ropa", label: "👕 Ropa" },
          { key: "gasolina", label: "⛽ Gasolina" },
        ].map(tab => {
          const isActive = activeTab === tab.key
          const accent = tab.key === "ropa" ? "#2563eb" : "#ea580c"
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as "ropa" | "gasolina")}
              style={{
                position: "relative",
                padding: "8px 16px",
                borderRadius: "6px",
                border: "none",
                backgroundColor: "transparent",
                color: isActive ? accent : "#666",
                fontWeight: isActive ? 600 : 500,
                fontSize: "14px",
                cursor: "pointer",
                transition: "color 0.15s, background-color 0.15s",
              }}
              onMouseEnter={e => {
                if (!isActive) e.currentTarget.style.backgroundColor = tab.key === "ropa" ? "#eff6ff" : "#fff7ed"
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
                  backgroundColor: accent,
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
      </main>
    </div>
  )
}
