import { useState, useEffect, useMemo } from "react"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import AppHeader from "./AppHeader"
import type { Page } from "./AppHeader"
import { useToast } from "./Toast"
import {
  getCategorias,
  getDepartamentosProd,
  getConsumoMensualPorDepartamento,
  getResumenPorDepartamento,
  getCostePorDepartamento,
  getSalidas,
  crearDepartamentoProd,
  type CategoriaProducto,
  type DepartamentoProd,
  type ConsumoMensualDepartamento,
  type CostePorDepartamento,
  type ResumenDepartamento,
  type SalidaProducto,
} from "./cleaningService"
import CatalogView from "./CatalogView"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  Legend,
} from "recharts"

// ─── Paleta ───────────────────────────────────────────────────────────────────

const PALETTE = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#06b6d4", "#f97316", "#84cc16",
]

const MESES_CORTO = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]

// ─── Types ────────────────────────────────────────────────────────────────────

type SubPage = "catalog" | "stats"

// ─── Estilos base ─────────────────────────────────────────────────────────────

const css = {
  card: {
    backgroundColor: "#fff",
    border: "1px solid #e8edf3",
    borderRadius: "14px",
    padding: "24px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
  } as React.CSSProperties,

  sectionTitle: {
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    color: "#94a3b8",
    marginBottom: "16px",
  } as React.CSSProperties,

  cardTitle: {
    fontSize: "15px",
    fontWeight: 700,
    color: "#0f172a",
    margin: "0 0 4px",
  } as React.CSSProperties,

  cardSub: {
    fontSize: "12px",
    color: "#94a3b8",
    margin: "0 0 20px",
  } as React.CSSProperties,

  select: {
    padding: "8px 12px",
    borderRadius: "9px",
    border: "1.5px solid #e2e8f0",
    backgroundColor: "#fff",
    fontSize: "13px",
    color: "#334155",
    outline: "none",
    cursor: "pointer",
  } as React.CSSProperties,

  inputText: {
    padding: "8px 12px",
    borderRadius: "9px",
    border: "1.5px solid #e2e8f0",
    backgroundColor: "#fff",
    fontSize: "13px",
    color: "#334155",
    outline: "none",
  } as React.CSSProperties,

  btnPrimary: {
    padding: "8px 16px",
    borderRadius: "9px",
    border: "none",
    backgroundColor: "#3b82f6",
    color: "#fff",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  } as React.CSSProperties,

  btnGhost: {
    padding: "8px 16px",
    borderRadius: "9px",
    border: "1.5px solid #e2e8f0",
    backgroundColor: "transparent",
    color: "#64748b",
    fontSize: "13px",
    fontWeight: 500,
    cursor: "pointer",
  } as React.CSSProperties,

  th: {
    padding: "11px 14px",
    textAlign: "left" as const,
    backgroundColor: "#f8fafc",
    borderBottom: "1px solid #e8edf3",
    fontWeight: 600,
    color: "#64748b",
    fontSize: "11px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  } as React.CSSProperties,

  td: {
    padding: "12px 14px",
    fontSize: "13px",
    color: "#334155",
    borderBottom: "1px solid #f1f5f9",
  } as React.CSSProperties,
}

// ─── Tooltip personalizado ────────────────────────────────────────────────────

function CustomBarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      backgroundColor: "#1e293b",
      border: "none",
      borderRadius: "10px",
      padding: "10px 14px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
      fontSize: "12px",
      color: "#f1f5f9",
      minWidth: "130px",
    }}>
      <p style={{ margin: "0 0 8px", fontWeight: 700, color: "#fff" }}>{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "16px", marginBottom: "2px" }}>
          <span style={{ color: p.color }}>{p.name}</span>
          <span style={{ fontWeight: 600 }}>
            {typeof p.value === "number"
              ? p.dataKey?.includes("coste") || p.name?.includes("€")
                ? `${p.value.toLocaleString("es-ES", { minimumFractionDigits: 2 })} €`
                : p.value.toLocaleString()
              : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Tarjeta KPI ──────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color = "#3b82f6", icon }: {
  label: string; value: string; sub?: string; color?: string; icon: string
}) {
  return (
    <div style={{
      ...css.card,
      display: "flex",
      alignItems: "flex-start",
      gap: "16px",
      flex: "1 1 180px",
    }}>
      <div style={{
        width: "44px", height: "44px", borderRadius: "12px",
        backgroundColor: `${color}15`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "20px", flexShrink: 0,
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
        <div style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", lineHeight: 1.2, marginTop: "2px" }}>{value}</div>
        {sub && <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "3px" }}>{sub}</div>}
      </div>
    </div>
  )
}

// ─── Barra de progreso de departamento ────────────────────────────────────────

function DeptProgressBar({ nombre, cantidad, coste, maxCantidad, maxCoste, color, rank }: {
  nombre: string; cantidad: number; coste: number | null
  maxCantidad: number; maxCoste: number; color: string; rank: number
}) {
  const pctCantidad = maxCantidad > 0 ? (cantidad / maxCantidad) * 100 : 0
  const pctCoste = maxCoste > 0 && coste ? (coste / maxCoste) * 100 : 0

  return (
    <div style={{
      padding: "16px 18px",
      borderRadius: "12px",
      border: "1px solid #f1f5f9",
      backgroundColor: "#fafbfc",
      transition: "border-color 0.15s",
    }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = color)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "#f1f5f9")}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: "24px", height: "24px", borderRadius: "50%",
            backgroundColor: color, color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "11px", fontWeight: 800, flexShrink: 0,
          }}>{rank}</div>
          <span style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a" }}>{nombre}</span>
        </div>
        <div style={{ display: "flex", gap: "16px" }}>
          {coste != null && coste > 0 && (
            <span style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>
              {coste.toLocaleString("es-ES", { minimumFractionDigits: 2 })} €
            </span>
          )}
          <span style={{ fontSize: "13px", color: "#64748b" }}>
            {cantidad.toLocaleString()} uds.
          </span>
        </div>
      </div>

      {/* Barra cantidad */}
      <div style={{ marginBottom: "6px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
          <span style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Productos consumidos</span>
          <span style={{ fontSize: "10px", color: "#94a3b8" }}>{pctCantidad.toFixed(0)}%</span>
        </div>
        <div style={{ height: "6px", backgroundColor: "#e8edf3", borderRadius: "99px", overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${pctCantidad}%`, backgroundColor: color,
            borderRadius: "99px", transition: "width 0.5s ease",
          }} />
        </div>
      </div>

      {/* Barra coste */}
      {coste != null && maxCoste > 0 && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
            <span style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Gasto económico</span>
            <span style={{ fontSize: "10px", color: "#94a3b8" }}>{pctCoste.toFixed(0)}%</span>
          </div>
          <div style={{ height: "6px", backgroundColor: "#e8edf3", borderRadius: "99px", overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${pctCoste}%`,
              background: `linear-gradient(90deg, ${color}aa, ${color})`,
              borderRadius: "99px", transition: "width 0.5s ease",
            }} />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Vista estadísticas ───────────────────────────────────────────────────────

function VistaEstadisticas() {
  const toast = useToast()
  const [departamentos, setDepartamentos] = useState<DepartamentoProd[]>([])
  const [categorias, setCategorias] = useState<CategoriaProducto[]>([])
  const [anio, setAnio] = useState<number | "">("")
  const [categoriaId, setCategoriaId] = useState<number | "">("")
  const [departamentoFiltro, setDepartamentoFiltro] = useState<number | "">("")
  const [consumoMensual, setConsumoMensual] = useState<ConsumoMensualDepartamento[]>([])
  const [costeDepts, setCosteDepts] = useState<CostePorDepartamento[]>([])
  const [resumen, setResumen] = useState<ResumenDepartamento[]>([])
  const [salidasFiltradas, setSalidasFiltradas] = useState<SalidaProducto[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingSalidas, setLoadingSalidas] = useState(false)
  const [showNewDeptInput, setShowNewDeptInput] = useState(false)
  const [newDeptName, setNewDeptName] = useState("")
  // paginación salidas
  const [salidaPage, setSalidaPage] = useState(0)
  const SALIDAS_PER_PAGE = 20

  useEffect(() => {
    Promise.all([getDepartamentosProd(), getCategorias()]).then(([depts, cats]) => {
      setDepartamentos(depts); setCategorias(cats)
    }).catch(e => toast.error("Error", e?.message ?? String(e)))
  }, [])

  useEffect(() => { loadStats() }, [anio, categoriaId])
  useEffect(() => { loadSalidas(); setSalidaPage(0) }, [anio, categoriaId, departamentoFiltro])

  async function loadStats() {
    setLoading(true)
    try {
      const yearFilter = anio !== "" ? { anio_desde: anio as number, anio_hasta: anio as number } : {}
      const catFilter = categoriaId !== "" ? { categoria_id: Number(categoriaId) } : {}
      const [consumoData, resumenData, costeData] = await Promise.all([
        getConsumoMensualPorDepartamento(yearFilter),
        getResumenPorDepartamento({ ...(anio !== "" && { anio: anio as number }), ...catFilter }),
        getCostePorDepartamento({ ...yearFilter, ...catFilter }),
      ])
      setConsumoMensual(consumoData); setResumen(resumenData); setCosteDepts(costeData)
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  async function loadSalidas() {
    setLoadingSalidas(true)
    try {
      const data = await getSalidas({
        ...(anio !== "" && { anio: anio as number }),
        departamento_id: departamentoFiltro !== "" ? Number(departamentoFiltro) : undefined,
        categoria_id: categoriaId !== "" ? Number(categoriaId) : undefined,
      })
      setSalidasFiltradas(data)
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    } finally {
      setLoadingSalidas(false)
    }
  }

  // ── Datos derivados ──────────────────────────────────────────────────────────

  const currentYear = new Date().getFullYear()
  const aniosPosibles = [currentYear, currentYear-1, currentYear-2, currentYear-3, currentYear-4]

  // Merge resumen + coste por dept
  const deptData = useMemo(() => {
    return resumen.map(r => {
      const costeRow = costeDepts.find(c => c.departamento_id === r.departamento_id)
      return { ...r, coste_total: costeRow?.coste_total ?? null } as ResumenDepartamento & { coste_total: number | null; productos_distintos?: number }
    }).sort((a, b) => (b.total_cantidad ?? 0) - (a.total_cantidad ?? 0))
  }, [resumen, costeDepts])

  const maxCantidad = useMemo(() => Math.max(...deptData.map(d => d.total_cantidad ?? 0), 1), [deptData])
  const maxCoste = useMemo(() => Math.max(...deptData.map(d => d.coste_total ?? 0), 1), [deptData])

  const totalCantidad = useMemo(() => deptData.reduce((s, d) => s + (d.total_cantidad ?? 0), 0), [deptData])
  const totalCoste = useMemo(() => deptData.reduce((s, d) => s + (d.coste_total ?? 0), 0), [deptData])
  const totalSalidas = useMemo(() => deptData.reduce((s, d) => s + (d.total_salidas ?? 0), 0), [deptData])
  const hayCoste = deptData.some(d => d.coste_total && d.coste_total > 0)

  // Datos para gráfico de barras comparativo (coste)
  const barCostData = useMemo(() =>
    costeDepts
      .filter(d => d.coste_total > 0)
      .sort((a, b) => b.coste_total - a.coste_total)
      .map((d, i) => ({ nombre: d.departamento_nombre, coste: d.coste_total, color: PALETTE[i % PALETTE.length] }))
  , [costeDepts])

  // Datos para gráfico de consumo mensual apilado
  const barMonthData = useMemo(() => {
    const map = new Map<string, any>()
    consumoMensual.forEach(item => {
      const label = `${MESES_CORTO[item.mes - 1]} ${item.anio}`
      if (!map.has(label)) map.set(label, { mes: label })
      map.get(label)[item.departamento_nombre] = item.total_cantidad
    })
    return Array.from(map.values())
  }, [consumoMensual])

  // Paginación salidas
  const totalPages = Math.ceil(salidasFiltradas.length / SALIDAS_PER_PAGE)
  const salidasPagina = salidasFiltradas.slice(salidaPage * SALIDAS_PER_PAGE, (salidaPage + 1) * SALIDAS_PER_PAGE)

  // ── Exportar PDF ─────────────────────────────────────────────────────────────

  function exportarPDF() {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
    const anioLabel = anio !== "" ? String(anio) : "Todos los años"
    const ahora = new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })
    const pageW = doc.internal.pageSize.getWidth()

    // ── Encabezado ──────────────────────────────────────────────────────────
    doc.setFillColor(30, 41, 59)          // slate-800
    doc.rect(0, 0, pageW, 36, "F")

    doc.setTextColor(255, 255, 255)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(18)
    doc.text("Resumen Anual de Gastos", 14, 16)

    doc.setFontSize(10)
    doc.setFont("helvetica", "normal")
    doc.text(`Período: ${anioLabel}`, 14, 25)
    doc.text(`Generado: ${ahora}`, 14, 31)

    // ── KPIs globales ───────────────────────────────────────────────────────
    let y = 46

    const kpis = [
      { label: "Unidades consumidas", value: (totalCantidad ?? 0).toLocaleString("es-ES") },
      { label: "Registros de salida", value: (totalSalidas ?? 0).toLocaleString("es-ES") },
      ...(hayCoste ? [{ label: "Gasto total", value: `${(totalCoste ?? 0).toLocaleString("es-ES", { minimumFractionDigits: 2 })} €` }] : []),
      ...(deptData[0] ? [{ label: "Mayor consumidor", value: deptData[0].departamento_nombre }] : []),
    ]

    const kpiW = (pageW - 28) / kpis.length
    kpis.forEach((kpi, i) => {
      const x = 14 + i * kpiW
      doc.setFillColor(241, 245, 249)     // slate-100
      doc.roundedRect(x, y, kpiW - 4, 20, 3, 3, "F")
      doc.setTextColor(100, 116, 139)     // slate-500
      doc.setFont("helvetica", "normal")
      doc.setFontSize(7)
      doc.text(kpi.label.toUpperCase(), x + 4, y + 7)
      doc.setTextColor(15, 23, 42)        // slate-900
      doc.setFont("helvetica", "bold")
      doc.setFontSize(11)
      doc.text(kpi.value, x + 4, y + 16)
    })

    y += 28

    // ── Tabla por departamento ───────────────────────────────────────────────
    doc.setTextColor(15, 23, 42)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(12)
    doc.text("Gasto por Departamento", 14, y)
    y += 4

    const columns = [
      { header: "#",              dataKey: "rank" },
      { header: "Departamento",   dataKey: "nombre" },
      { header: "Uds. consumidas", dataKey: "cantidad" },
      { header: "Nº salidas",     dataKey: "salidas" },
      { header: "Productos distintos", dataKey: "productos" },
      ...(hayCoste ? [{ header: "Gasto (€)", dataKey: "coste" }] : []),
      ...(hayCoste ? [{ header: "% del total", dataKey: "pct" }] : []),
    ]

    const rows = deptData.map((d, i) => ({
      rank: i + 1,
      nombre: d.departamento_nombre,
      cantidad: (d.total_cantidad ?? 0).toLocaleString("es-ES"),
      salidas: (d.total_salidas ?? 0).toLocaleString("es-ES"),
      productos: (d.productos_distintos ?? 0).toLocaleString("es-ES"),
      ...(hayCoste && {
        coste: d.coste_total
          ? d.coste_total.toLocaleString("es-ES", { minimumFractionDigits: 2 })
          : "—",
        pct: totalCoste > 0 && d.coste_total
          ? `${((d.coste_total / totalCoste) * 100).toFixed(1)}%`
          : "—",
      }),
    }))

    autoTable(doc, {
      startY: y + 2,
      columns,
      body: rows,
      styles: { fontSize: 9, cellPadding: 3, textColor: [15, 23, 42] },
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold", fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        rank:      { halign: "center", cellWidth: 8 },
        cantidad:  { halign: "right" },
        salidas:   { halign: "right" },
        productos: { halign: "right" },
        ...(hayCoste ? { coste: { halign: "right", fontStyle: "bold" } } : {}),
        ...(hayCoste ? { pct:   { halign: "right" } } : {}),
      },
      didParseCell: (data) => {
        // Colorea la fila de totales
        if (data.row.index === rows.length) {
          data.cell.styles.fillColor = [30, 41, 59]
          data.cell.styles.textColor = 255
          data.cell.styles.fontStyle = "bold"
        }
      },
    })

    // ── Fila de totales ─────────────────────────────────────────────────────
    const afterTableY = (doc as any).lastAutoTable.finalY + 2

    autoTable(doc, {
      startY: afterTableY,
      columns: columns.map(c => ({ ...c, header: "" })),
      body: [{
        rank: "",
        nombre: "TOTAL",
        cantidad: totalCantidad.toLocaleString("es-ES"),
        salidas: totalSalidas.toLocaleString("es-ES"),
        productos: "",
        ...(hayCoste && {
          coste: totalCoste.toLocaleString("es-ES", { minimumFractionDigits: 2 }),
          pct: "100%",
        }),
      }],
      styles: { fontSize: 9, cellPadding: 3 },
      bodyStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold" },
      columnStyles: {
        rank:      { halign: "center", cellWidth: 8 },
        cantidad:  { halign: "right" },
        salidas:   { halign: "right" },
        productos: { halign: "right" },
        ...(hayCoste ? { coste: { halign: "right" } } : {}),
        ...(hayCoste ? { pct:   { halign: "right" } } : {}),
      },
      showHead: false,
    })

    // ── Pie de página ───────────────────────────────────────────────────────
    const pageH = doc.internal.pageSize.getHeight()
    doc.setFillColor(241, 245, 249)
    doc.rect(0, pageH - 12, pageW, 12, "F")
    doc.setTextColor(148, 163, 184)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7)
    doc.text("Generado automáticamente · Gestión de Almacén", 14, pageH - 4)
    doc.text(`Página 1 de 1`, pageW - 14, pageH - 4, { align: "right" })

    // ── Guardar ─────────────────────────────────────────────────────────────
    const filename = anio !== ""
      ? `gastos_departamentos_${anio}.pdf`
      : `gastos_departamentos_todos_anios.pdf`
    doc.save(filename)
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>

      {/* ── FILTROS ──────────────────────────────────────────────────────────── */}
      <div style={{ ...css.card, padding: "16px 20px" }}>
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600 }}>FILTRAR POR</span>

          <select value={anio} onChange={e => setAnio(e.target.value === "" ? "" : Number(e.target.value))} style={css.select}>
            <option value="">Todos los años</option>
            {aniosPosibles.map(a => <option key={a} value={a}>{a}</option>)}
          </select>

          <select value={categoriaId} onChange={e => setCategoriaId(e.target.value === "" ? "" : Number(e.target.value))} style={css.select}>
            <option value="">Todas las categorías</option>
            {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>

          {/* Depto (solo para salidas) */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {showNewDeptInput ? (
              <>
                <input
                  type="text" placeholder="Nombre del depto" value={newDeptName}
                  onChange={e => setNewDeptName(e.target.value)}
                  style={{ ...css.inputText, width: "160px" }} autoFocus
                />
                <button
                  style={{ ...css.btnPrimary, backgroundColor: newDeptName.trim() ? "#10b981" : "#cbd5e1", padding: "8px 12px" }}
                  disabled={!newDeptName.trim()}
                  onClick={async () => {
                    if (!newDeptName.trim()) return
                    try {
                      const id = await crearDepartamentoProd(newDeptName.trim())
                      const depts = await getDepartamentosProd()
                      setDepartamentos(depts); setDepartamentoFiltro(id)
                      setNewDeptName(""); setShowNewDeptInput(false)
                      toast.success("Departamento creado")
                    } catch (e: any) { toast.error("Error", e.message) }
                  }}
                >✓</button>
                <button style={{ ...css.btnGhost, padding: "8px 12px" }} onClick={() => { setShowNewDeptInput(false); setNewDeptName("") }}>✕</button>
              </>
            ) : (
              <select
                value={departamentoFiltro}
                onChange={e => {
                  if (e.target.value === "nuevo") setShowNewDeptInput(true)
                  else setDepartamentoFiltro(e.target.value === "" ? "" : Number(e.target.value))
                }}
                style={{ ...css.select, borderStyle: departamentoFiltro !== "" ? "solid" : "dashed" }}
              >
                <option value="">Todos los deptos (salidas)</option>
                {departamentos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                <option value="nuevo">➕ Crear departamento...</option>
              </select>
            )}
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
            <button
              style={css.btnPrimary}
              onClick={() => { loadStats(); loadSalidas() }}
            >↻ Actualizar</button>
            <button
              style={{
                ...css.btnGhost,
                display: "flex",
                alignItems: "center",
                gap: "6px",
                borderColor: "#e2e8f0",
                color: "#334155",
              }}
              disabled={deptData.length === 0}
              onClick={exportarPDF}
              title={deptData.length === 0 ? "No hay datos para exportar" : `Exportar resumen${anio !== "" ? ` de ${anio}` : " anual"} a PDF`}
            >
              <span style={{ fontSize: "14px" }}>📄</span>
              Exportar PDF
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "80px", color: "#94a3b8", fontSize: "14px" }}>
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>⏳</div>
          Cargando datos…
        </div>
      ) : (
        <>
          {/* ── SECCIÓN 1: KPIs globales ────────────────────────────────────── */}
          {deptData.length > 0 && (
            <div>
              <div style={css.sectionTitle}>Resumen global{anio !== "" ? ` · ${anio}` : ""}</div>
              <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
                <KpiCard
                  icon="📦" label="Unidades consumidas"
                  value={(totalCantidad ?? 0).toLocaleString()}
                  sub={`${deptData.length} departamentos`}
                  color="#3b82f6"
                />
                <KpiCard
                  icon="🧾" label="Registros de salida"
                  value={(totalSalidas ?? 0).toLocaleString()}
                  color="#8b5cf6"
                />
                {hayCoste && (
                  <KpiCard
                    icon="💶" label="Gasto total"
                    value={`${(totalCoste ?? 0).toLocaleString("es-ES", { minimumFractionDigits: 2 })} €`}
                    color="#10b981"
                  />
                )}
                {deptData[0] && (
                  <KpiCard
                    icon="🏆" label="Mayor consumidor"
                    value={deptData[0].departamento_nombre}
                    sub={`${(deptData[0].total_cantidad ?? 0).toLocaleString()} uds.`}
                    color="#f59e0b"
                  />
                )}
              </div>
            </div>
          )}

          {/* ── SECCIÓN 2: Gasto por departamento ──────────────────────────── */}
          {deptData.length > 0 && (
            <div>
              <div style={css.sectionTitle}>Gasto por departamento</div>
              <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "flex-start" }}>

                {/* Barras de progreso */}
                <div style={{ flex: "2 1 360px", display: "flex", flexDirection: "column", gap: "10px" }}>
                  {deptData.map((d, i) => (
                    <DeptProgressBar
                      key={d.departamento_id}
                      nombre={d.departamento_nombre}
                      cantidad={d.total_cantidad ?? 0}
                      coste={d.coste_total}
                      maxCantidad={maxCantidad}
                      maxCoste={maxCoste}
                      color={PALETTE[i % PALETTE.length]}
                      rank={i + 1}
                    />
                  ))}
                </div>

                {/* Tabla resumen lateral */}
                <div style={{ ...css.card, flex: "1 1 240px", padding: "0", overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={css.th}>Departamento</th>
                        <th style={{ ...css.th, textAlign: "right" }}>Uds.</th>
                        {hayCoste && <th style={{ ...css.th, textAlign: "right" }}>Coste</th>}
                        <th style={{ ...css.th, textAlign: "right" }}>Productos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deptData.map((d, i) => (
                        <tr key={d.departamento_id}>
                          <td style={css.td}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: PALETTE[i % PALETTE.length], flexShrink: 0 }} />
                              <span style={{ fontWeight: 500 }}>{d.departamento_nombre}</span>
                            </div>
                          </td>
                          <td style={{ ...css.td, textAlign: "right", fontWeight: 700, color: PALETTE[i % PALETTE.length] }}>
                            {(d.total_cantidad ?? 0).toLocaleString()}
                          </td>
                          {hayCoste && (
                            <td style={{ ...css.td, textAlign: "right", color: "#0f172a", fontWeight: 600 }}>
                              {d.coste_total ? `${d.coste_total.toLocaleString("es-ES", { minimumFractionDigits: 2 })} €` : "—"}
                            </td>
                          )}
                          <td style={{ ...css.td, textAlign: "right", color: "#64748b" }}>
                            {d.productos_distintos ?? 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── SECCIÓN 3: Comparativa (gráficos) ──────────────────────────── */}
          <div>
            <div style={css.sectionTitle}>Comparativa de gasto</div>
            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>

              {/* Gráfico coste por departamento */}
              {barCostData.length > 0 ? (
                <div style={{ ...css.card, flex: "1 1 360px" }}>
                  <p style={css.cardTitle}>Coste económico por departamento</p>
                  <p style={css.cardSub}>Comparativa en euros según precio de productos</p>
                  <div style={{ height: "260px" }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={barCostData} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f4f8" horizontal={false} />
                        <XAxis type="number" tickFormatter={v => `${v.toLocaleString()}€`} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="nombre" tick={{ fontSize: 12, fill: "#334155" }} width={100} axisLine={false} tickLine={false} />
                        <Tooltip content={<CustomBarTooltip />} cursor={{ fill: "#f1f5f9" }} />
                        <Bar dataKey="coste" radius={[0, 6, 6, 0]} maxBarSize={28}>
                          {barCostData.map((d, i) => <Cell key={i} fill={d.color} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <div style={{ ...css.card, flex: "1 1 360px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px", gap: "8px" }}>
                  <span style={{ fontSize: "32px" }}>💰</span>
                  <p style={{ margin: 0, color: "#94a3b8", fontSize: "13px", textAlign: "center" }}>
                    Sin datos de coste.<br />Añade precios a los productos para ver este gráfico.
                  </p>
                </div>
              )}

              {/* Gráfico consumo mensual */}
              {barMonthData.length > 0 && (
                <div style={{ ...css.card, flex: "2 1 420px" }}>
                  <p style={css.cardTitle}>Consumo mensual por departamento</p>
                  <p style={css.cardSub}>Unidades totales consumidas cada mes</p>
                  <div style={{ height: "260px" }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={barMonthData} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f4f8" vertical={false} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={v => v.toLocaleString()} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                        <Tooltip content={<CustomBarTooltip />} cursor={{ fill: "#f1f5f9" }} />
                        <Legend wrapperStyle={{ fontSize: "12px" }} />
                        {departamentos.map((dept, i) => (
                          <Bar key={dept.id} dataKey={dept.nombre} stackId="a" fill={PALETTE[i % PALETTE.length]} radius={i === departamentos.length - 1 ? [4, 4, 0, 0] : [0,0,0,0]} maxBarSize={40} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── SECCIÓN 4: Registro de salidas ─────────────────────────────── */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <div style={css.sectionTitle}>
                Registro de salidas
                {departamentoFiltro !== "" && ` · ${departamentos.find(d => d.id === departamentoFiltro)?.nombre ?? ""}`}
                {anio !== "" && ` · ${anio}`}
              </div>
              {salidasFiltradas.length > 0 && (
                <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                  {salidasFiltradas.length} registros
                </span>
              )}
            </div>

            <div style={{ ...css.card, padding: 0, overflow: "hidden" }}>
              {loadingSalidas ? (
                <div style={{ padding: "48px", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>Cargando…</div>
              ) : salidasFiltradas.length === 0 ? (
                <div style={{ padding: "48px", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
                  <div style={{ fontSize: "28px", marginBottom: "8px" }}>📋</div>
                  No hay registros para los filtros seleccionados.
                </div>
              ) : (
                <>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={css.th}>Producto</th>
                          <th style={css.th}>Departamento</th>
                          <th style={{ ...css.th, textAlign: "center" }}>Mes / Año</th>
                          <th style={{ ...css.th, textAlign: "right" }}>Cantidad</th>
                          <th style={css.th}>Unidad</th>
                        </tr>
                      </thead>
                      <tbody>
                        {salidasPagina.map(s => {
                          const deptIdx = departamentos.findIndex(d => d.nombre === s.departamento_nombre)
                          const deptColor = PALETTE[deptIdx % PALETTE.length] ?? "#94a3b8"
                          return (
                            <tr key={s.id} style={{ transition: "background 0.1s" }}
                              onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#f8fafc")}
                              onMouseLeave={e => (e.currentTarget.style.backgroundColor = "")}
                            >
                              <td style={css.td}>
                                <span style={{
                                  display: "inline-block",
                                  backgroundColor: "#eff6ff",
                                  color: "#2563eb",
                                  borderRadius: "6px",
                                  padding: "2px 7px",
                                  fontSize: "11px",
                                  fontWeight: 700,
                                  letterSpacing: "0.03em",
                                  marginBottom: "3px",
                                }}>{s.producto_referencia}</span>
                                <div style={{ fontSize: "12px", color: "#475569" }}>{s.producto_nombre}</div>
                              </td>
                              <td style={css.td}>
                                <span style={{
                                  display: "inline-flex", alignItems: "center", gap: "6px",
                                  backgroundColor: `${deptColor}12`,
                                  color: deptColor,
                                  borderRadius: "99px",
                                  padding: "3px 10px",
                                  fontSize: "12px",
                                  fontWeight: 600,
                                }}>
                                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: deptColor, flexShrink: 0 }} />
                                  {s.departamento_nombre}
                                </span>
                              </td>
                              <td style={{ ...css.td, textAlign: "center", color: "#64748b", fontSize: "12px" }}>
                                {MESES_CORTO[(s.mes ?? 1) - 1]} {s.anio}
                              </td>
                              <td style={{ ...css.td, textAlign: "right", fontWeight: 700, fontSize: "14px", color: "#0f172a", fontVariantNumeric: "tabular-nums" }}>
                                {(s.cantidad ?? 0).toLocaleString()}
                              </td>
                              <td style={{ ...css.td, color: "#94a3b8", fontSize: "12px" }}>{s.unidad_medida}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Paginación */}
                  {totalPages > 1 && (
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "12px 16px", borderTop: "1px solid #f1f5f9",
                    }}>
                      <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                        Página {salidaPage + 1} de {totalPages}
                      </span>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          style={{ ...css.btnGhost, padding: "6px 12px", opacity: salidaPage === 0 ? 0.4 : 1 }}
                          disabled={salidaPage === 0}
                          onClick={() => setSalidaPage(p => p - 1)}
                        >← Anterior</button>
                        <button
                          style={{ ...css.btnGhost, padding: "6px 12px", opacity: salidaPage >= totalPages - 1 ? 0.4 : 1 }}
                          disabled={salidaPage >= totalPages - 1}
                          onClick={() => setSalidaPage(p => p + 1)}
                        >Siguiente →</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function ProductsPage({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const [subPage, setSubPage] = useState<SubPage>("catalog")

  const TABS: { key: SubPage; label: string; icon: string }[] = [
    { key: "catalog", label: "Catálogo", icon: "📦" },
    { key: "stats",   label: "Estadísticas", icon: "📊" },
  ]

  return (
    <div style={{ minHeight: "calc(100vh - 64px)", backgroundColor: "#f4f6f9", fontFamily: "'Geist', 'DM Sans', system-ui, sans-serif" }}>
      <AppHeader page="productos" onNavigate={onNavigate} />

      {/* Sub-nav */}
      <div style={{
        backgroundColor: "#fff",
        borderBottom: "1px solid #e8edf3",
        padding: "0 32px",
        display: "flex",
        alignItems: "center",
        height: "50px",
        gap: "4px",
      }}>
        {TABS.map(tab => {
          const active = subPage === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setSubPage(tab.key)}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "none",
                backgroundColor: active ? "#eff6ff" : "transparent",
                color: active ? "#2563eb" : "#64748b",
                fontWeight: active ? 700 : 500,
                fontSize: "13px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                transition: "all 0.12s",
                letterSpacing: "0.01em",
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.backgroundColor = "#f8fafc" }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.backgroundColor = "transparent" }}
            >
              <span style={{ fontSize: "14px" }}>{tab.icon}</span>
              {tab.label}
            </button>
          )
        })}
      </div>

      <main style={{ maxWidth: "1280px", margin: "0 auto", padding: "28px 24px" }}>
        {subPage === "catalog" && <CatalogView />}
        {subPage === "stats"   && <VistaEstadisticas />}
      </main>
    </div>
  )
}