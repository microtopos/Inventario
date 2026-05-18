import { useCallback, useEffect, useMemo, useState } from "react"
import AppHeader from "./AppHeader"
import type { Page } from "./AppHeader"
import { usePagination } from "./usePagination"
import {
  Cell, Pie, PieChart, ResponsiveContainer, Tooltip
} from "recharts"
import { endOfYear, format, startOfYear, subDays, subMonths } from "date-fns"
import {
  getConsumoPorDepartamento,
  getEntradasPorDepartamento,
  getMovimientos,
  getMovimientosCount,
} from "./statisticsService"
import { cardStyleLegacy, inputStyle, btnStyle, thStyle, tdStyle } from "./styles"


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

function pivotToDonutData(pivot: ReturnType<typeof pivotByMes>) {
  const totals = sumByDepartamento(pivot)
  const total = Object.values(totals).reduce((a, b) => a + b, 0)
  return pivot.departments.map(dept => ({
    name: dept,
    value: totals[dept] || 0,
    pct: total > 0 ? ((totals[dept] || 0) / total * 100).toFixed(1) : "0"
  }))
}

function RopaStats() {
  const [desde, setDesde] = useState<string>("")
  const [hasta, setHasta] = useState<string>("")
  const [preset, setPreset] = useState<RangePreset>("all")

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
        const [e, c] = await Promise.all([
          getEntradasPorDepartamento(d, h),
          getConsumoPorDepartamento(d, h),
        ])
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
          <h2 style={{ fontSize: "18px", fontWeight: 700, margin: 0, color: "#111", letterSpacing: "-0.3px" }}>
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
                ...btnStyle,
                border: `1px solid ${preset === p.key ? "#2563eb" : "#d1d5db"}`,
                backgroundColor: preset === p.key ? "#eff6ff" : "#fff",
                color: preset === p.key ? "#2563eb" : "#374151",
                fontWeight: preset === p.key ? 600 : 500,
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
              style={{ ...inputStyle, minWidth: "auto" }}
            />
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ fontSize: "13px", color: "#888" }}>Hasta:</span>
            <input
              type="date"
              value={hasta}
              onChange={e => setHasta(e.target.value)}
              style={{ ...inputStyle, minWidth: "auto" }}
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
        {/* Entradas por Departamento */}
        <div style={{ ...cardStyleLegacy, gridColumn: "span 1" }}>
          <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#111", marginBottom: "16px", margin: 0 }}>Entradas por Departamento</h3>
          <div style={{ height: "240px", marginTop: "12px", display: "flex", justifyContent: "center", alignItems: "center" }}>
            {entradasPivot.data.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pivotToDonutData(entradasPivot)}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={40}
                    label={({ name, pct }) => `${name} (${pct}%)`}
                    labelLine={false}
                  >
                    {entradasPivot.departments.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ color: "#999" }}>No hay datos</div>
            )}
          </div>
          <div style={{ fontSize: "13px", color: "#888", textAlign: "center", marginTop: "8px" }}>
            Total: <strong style={{ color: "#111" }}>{totalEntradas.toLocaleString()}</strong> entradas
          </div>
        </div>

        {/* Consumo por Departamento */}
        <div style={{ ...cardStyleLegacy, gridColumn: "span 1" }}>
          <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#111", marginBottom: "16px", margin: 0 }}>Consumo por Departamento</h3>
          <div style={{ height: "240px", marginTop: "12px", display: "flex", justifyContent: "center", alignItems: "center" }}>
            {consumoPivot.data.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pivotToDonutData(consumoPivot)}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={40}
                    label={({ name, pct }) => `${name} (${pct}%)`}
                    labelLine={false}
                  >
                    {consumoPivot.departments.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ color: "#999" }}>No hay datos</div>
            )}
          </div>
          <div style={{ fontSize: "13px", color: "#888", textAlign: "center", marginTop: "8px" }}>
            Total: <strong style={{ color: "#111" }}>{totalConsumo.toLocaleString()}</strong> consumos
          </div>
        </div>
      </div>

      {/* MOVIMIENTOS RECIENTES */}
      <div style={{ ...cardStyleLegacy, padding: "20px 24px" }}>
        <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#111", marginBottom: "16px", margin: 0 }}>Movimientos Recientes</h3>
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
            {Array.from({ length: movPagination.totalPages }, (_, i) => i).map(pageIndex => (
              <button
                key={pageIndex}
                onClick={() => movPagination.goToPage(pageIndex)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border: "1px solid",
                  borderColor: movPagination.page === pageIndex ? "#2563eb" : "#e5e7eb",
                  backgroundColor: movPagination.page === pageIndex ? "#eff6ff" : "#fff",
                  color: movPagination.page === pageIndex ? "#2563eb" : "#666",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                {pageIndex + 1}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// MAIN STATISTICS PAGE (SOLO ROPA)
// ============================================================================

export default function StatisticsPage({ onNavigate }: { onNavigate: (page: Page) => void }) {
  return (
    <div style={{ minHeight: "calc(100vh - 64px)", backgroundColor: "#f5f5f5", fontFamily: "system-ui, sans-serif" }}>
      <AppHeader page="dashboard" onNavigate={onNavigate} onBack={() => onNavigate("inventory")} />
      <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "28px 24px" }}>
        <RopaStats />
      </main>
    </div>
  )
}
