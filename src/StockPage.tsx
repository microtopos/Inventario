import { useState, useEffect, useCallback } from "react"
import AppHeader from "./AppHeader"
import type { Page } from "./AppHeader"
import { useConfirm } from "./ConfirmDialog"
import { useToast } from "./Toast"
import { usePagination } from "./usePagination"
import {
  getArticulos, getCategorias, getResumen, getMovimientosRecientes,
  getMovimientosPaginados, eliminarMovimiento, desactivarArticulo,
  type ArticuloStock, type CategoriaStock, type MovimientoStock,
  type ResumenStock, type MovimientoReciente,
} from "./stockService"
import StockArticuloModal from "./StockArticuloModal"
import StockMovimientoModal from "./StockMovimientoModal"

// ─── Constantes ───────────────────────────────────────────────────────────────

const ACENTO = "#7c3aed"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fechaLocal(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("es-ES", {
    day: "2-digit", month: "2-digit", year: "numeric",
  })
}

function stockColor(articulo: ArticuloStock): { bg: string; color: string; label: string } {
  if (articulo.stock_actual === 0)
    return { bg: "#fee2e2", color: "#991b1b", label: "Sin stock" }
  if (articulo.stock_minimo !== null && articulo.stock_actual <= articulo.stock_minimo)
    return { bg: "#ffedd5", color: "#c2410c", label: "Stock bajo" }
  return { bg: "#dcfce7", color: "#166534", label: "OK" }
}

// ─── Paginación ───────────────────────────────────────────────────────────────

function PaginacionControls({
  page, totalPages, total, pageSize, onPageChange, onPageSizeChange,
}: {
  page: number; totalPages: number; total: number; pageSize: number
  onPageChange: (p: number) => void; onPageSizeChange: (s: number) => void
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", flexWrap: "wrap", gap: "10px" }}>
      <span style={{ fontSize: "12px", color: "#bbb" }}>
        {total} movimientos · p. {page + 1}/{Math.max(1, totalPages)}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <button onClick={() => onPageChange(page - 1)} disabled={page === 0}
          style={{ padding: "5px 10px", borderRadius: "6px", border: "1px solid #e0e0e0", backgroundColor: page === 0 ? "#f5f5f5" : "#fff", color: page === 0 ? "#ccc" : "#444", fontSize: "12px", cursor: page === 0 ? "not-allowed" : "pointer" }}>←</button>
        <select value={pageSize} onChange={e => onPageSizeChange(Number(e.target.value))}
          style={{ padding: "5px 8px", borderRadius: "6px", border: "1px solid #e0e0e0", fontSize: "12px", cursor: "pointer", backgroundColor: "#fff" }}>
          <option value={10}>10</option>
          <option value={25}>25</option>
          <option value={50}>50</option>
        </select>
        <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages - 1}
          style={{ padding: "5px 10px", borderRadius: "6px", border: "1px solid #e0e0e0", backgroundColor: page >= totalPages - 1 ? "#f5f5f5" : "#fff", color: page >= totalPages - 1 ? "#ccc" : "#444", fontSize: "12px", cursor: page >= totalPages - 1 ? "not-allowed" : "pointer" }}>→</button>
      </div>
    </div>
  )
}

// ─── Panel detalle del artículo ───────────────────────────────────────────────

function PanelArticulo({
  articulo,
  onEdit,
  onActualizado,
}: {
  articulo: ArticuloStock
  onEdit: () => void
  onActualizado: () => void
}) {
  const [modalMov, setModalMov] = useState<"entrada" | "salida" | null>(null)
  const [filtroTipo, setFiltroTipo] = useState<"" | "entrada" | "salida">("")
  const [filtroDesde, setFiltroDesde] = useState("")
  const [filtroHasta, setFiltroHasta] = useState("")
  const [confirmandoDesactivar, setConfirmandoDesactivar] = useState(false)
  const [desactivando, setDesactivando] = useState(false)
  const { confirm } = useConfirm()
  const toast = useToast()

  async function handleDesactivar() {
    setDesactivando(true)
    try {
      await desactivarArticulo(articulo.id)
      toast.success(`"${articulo.nombre}" desactivado`)
      onActualizado()
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    } finally {
      setDesactivando(false)
      setConfirmandoDesactivar(false)
    }
  }

  const { bg, color: stockCol, label: stockLabel } = stockColor(articulo)
  const hayFiltros = filtroTipo || filtroDesde || filtroHasta

  const fetchFn = useCallback(
    (pageSize: number, offset: number) =>
      getMovimientosPaginados(
        {
          articulo_id: articulo.id,
          tipo: filtroTipo || undefined,
          fecha_desde: filtroDesde || undefined,
          fecha_hasta: filtroHasta || undefined,
        },
        pageSize,
        offset
      ),
    [articulo.id, filtroTipo, filtroDesde, filtroHasta]
  )

  const { items: movimientos, total, page, pageSize, totalPages, loading, goToPage, setPageSize } =
    usePagination<MovimientoStock>({
      fetchFn,
      deps: [articulo.id, filtroTipo, filtroDesde, filtroHasta],
      defaultPageSize: 25,
    })

  async function handleEliminarMovimiento(mov: MovimientoStock) {
    const ok = await confirm(
      `¿Eliminar este movimiento de ${mov.tipo} (${mov.cantidad} ${articulo.unidad})?`,
      { confirmLabel: "Eliminar", danger: true, detail: "El stock se ajustará automáticamente." }
    )
    if (!ok) return
    try {
      await eliminarMovimiento(mov.id)
      toast.success("Movimiento eliminado")
      goToPage(page)
      onActualizado()
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Cabecera */}
      <div style={{ padding: "22px 28px 18px", borderBottom: "1px solid #f0f0f0" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
          {/* Info artículo */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#111", margin: 0, lineHeight: 1.2 }}>
              {articulo.nombre}
            </h2>
            {articulo.categoria_nombre && (
              <div style={{ fontSize: "13px", color: "#888", marginTop: "4px" }}>
                {articulo.categoria_nombre}
              </div>
            )}
          </div>

          {/* Stock actual */}
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: "11px", color: "#bbb", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>Stock actual</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "6px", justifyContent: "flex-end" }}>
              <span style={{ fontSize: "32px", fontWeight: 800, color: stockCol, lineHeight: 1 }}>
                {articulo.stock_actual}
              </span>
              <span style={{ fontSize: "14px", color: "#aaa" }}>{articulo.unidad}</span>
            </div>
            <span style={{ display: "inline-block", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "20px", backgroundColor: bg, color: stockCol, marginTop: "4px" }}>
              {stockLabel}
              {articulo.stock_minimo !== null && ` · mín. ${articulo.stock_minimo}`}
            </span>
          </div>
        </div>

        {/* Botones de acción */}
        <div style={{ display: "flex", gap: "8px", marginTop: "16px", flexWrap: "wrap" }}>
          <button onClick={() => setModalMov("entrada")}
            style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "8px", border: "none", backgroundColor: "#16a34a", color: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
            ↑ Entrada
          </button>
          <button onClick={() => setModalMov("salida")} disabled={articulo.stock_actual === 0}
            style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "8px", border: "none", backgroundColor: articulo.stock_actual > 0 ? "#dc2626" : "#e5e7eb", color: "#fff", fontSize: "13px", fontWeight: 600, cursor: articulo.stock_actual > 0 ? "pointer" : "not-allowed" }}>
            ↓ Salida
          </button>
          <button onClick={onEdit}
            style={{ padding: "8px 13px", borderRadius: "8px", border: "1px solid #e0e0e0", backgroundColor: "#fff", color: "#555", fontSize: "13px", cursor: "pointer" }}>
            Editar
          </button>

          {/* Desactivar — confirmación inline */}
          {confirmandoDesactivar ? (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 10px", borderRadius: "8px", border: "1px solid #fca5a5", backgroundColor: "#fff5f5" }}>
              <span style={{ fontSize: "12px", color: "#dc2626", fontWeight: 500 }}>¿Desactivar?</span>
              <button onClick={handleDesactivar} disabled={desactivando}
                style={{ padding: "4px 10px", borderRadius: "6px", border: "none", backgroundColor: "#dc2626", color: "#fff", fontSize: "12px", fontWeight: 600, cursor: desactivando ? "not-allowed" : "pointer" }}>
                {desactivando ? "…" : "Sí"}
              </button>
              <button onClick={() => setConfirmandoDesactivar(false)}
                style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid #e0e0e0", backgroundColor: "#fff", color: "#888", fontSize: "12px", cursor: "pointer" }}>
                No
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmandoDesactivar(true)}
              style={{ padding: "8px 13px", borderRadius: "8px", border: "1px solid #e0e0e0", backgroundColor: "#fff", color: "#aaa", fontSize: "13px", cursor: "pointer", marginLeft: "auto" }}>
              Desactivar
            </button>
          )}
        </div>

        {/* Filtros historial */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "14px", flexWrap: "wrap" }}>
          {(["", "entrada", "salida"] as const).map(t => (
            <button key={t} onClick={() => setFiltroTipo(t)}
              style={{
                padding: "5px 11px", borderRadius: "20px", border: "1px solid",
                borderColor: filtroTipo === t ? ACENTO : "#e0e0e0",
                backgroundColor: filtroTipo === t ? ACENTO + "10" : "#fff",
                color: filtroTipo === t ? ACENTO : "#888",
                fontSize: "12px", fontWeight: filtroTipo === t ? 600 : 400, cursor: "pointer",
              }}>
              {t === "" ? "Todos" : t.charAt(0).toUpperCase() + t.slice(1) + "s"}
            </button>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "8px" }}>
            <input type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)}
              style={{ padding: "5px 8px", borderRadius: "6px", border: `1px solid ${filtroDesde ? ACENTO : "#e0e0e0"}`, fontSize: "12px", backgroundColor: filtroDesde ? ACENTO + "08" : "#fff", outline: "none" }} />
            <span style={{ color: "#ccc", fontSize: "12px" }}>→</span>
            <input type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)}
              style={{ padding: "5px 8px", borderRadius: "6px", border: `1px solid ${filtroHasta ? ACENTO : "#e0e0e0"}`, fontSize: "12px", backgroundColor: filtroHasta ? ACENTO + "08" : "#fff", outline: "none" }} />
            {hayFiltros && (
              <button onClick={() => { setFiltroTipo(""); setFiltroDesde(""); setFiltroHasta("") }}
                style={{ padding: "5px 8px", borderRadius: "6px", border: "1px solid #e0e0e0", backgroundColor: "#fff", color: "#888", fontSize: "12px", cursor: "pointer" }}>✕</button>
            )}
          </div>
        </div>
      </div>

      {/* Tabla de movimientos */}
      <div style={{ padding: "0 28px 24px" }}>
        {loading ? (
          <div style={{ padding: "60px", textAlign: "center", color: "#ccc", fontSize: "14px" }}>Cargando…</div>
        ) : movimientos.length === 0 ? (
          <div style={{ padding: "60px 20px", textAlign: "center", color: "#ccc", fontSize: "14px", border: "1px dashed #e8e8e8", borderRadius: "10px", marginTop: "16px" }}>
            <div style={{ fontSize: "36px", marginBottom: "10px" }}>📋</div>
            {hayFiltros ? "Sin movimientos con esos filtros." : "Sin movimientos todavía. ¡Registra una entrada!"}
          </div>
        ) : (
          <>
            <div style={{ backgroundColor: "#fff", border: "1px solid #f0f0f0", borderRadius: "10px", overflow: "hidden", marginTop: "16px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ backgroundColor: "#fafafa", borderBottom: "1px solid #f0f0f0" }}>
                    {["Fecha", "Tipo", "Cantidad", "Notas", ""].map(h => (
                      <th key={h} style={{ padding: "9px 16px", textAlign: "left", fontSize: "10px", fontWeight: 700, color: "#bbb", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {movimientos.map(m => (
                    <tr key={m.id} style={{ borderBottom: "1px solid #f9f9f9" }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#fafafa")}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = "")}>
                      <td style={{ padding: "11px 16px", fontSize: "13px", color: "#555", whiteSpace: "nowrap" }}>
                        {fechaLocal(m.fecha)}
                      </td>
                      <td style={{ padding: "11px 16px" }}>
                        <span style={{
                          display: "inline-block", padding: "2px 9px", borderRadius: "20px", fontSize: "11px", fontWeight: 700,
                          backgroundColor: m.tipo === "entrada" ? "#dcfce7" : "#fee2e2",
                          color: m.tipo === "entrada" ? "#166534" : "#991b1b",
                        }}>
                          {m.tipo === "entrada" ? "↑ Entrada" : "↓ Salida"}
                        </span>
                      </td>
                      <td style={{ padding: "11px 16px", fontSize: "15px", fontWeight: 700, color: m.tipo === "entrada" ? "#16a34a" : "#dc2626", whiteSpace: "nowrap" }}>
                        {m.tipo === "entrada" ? "+" : "-"}{m.cantidad} <span style={{ fontSize: "12px", fontWeight: 400, color: "#aaa" }}>{articulo.unidad}</span>
                      </td>
                      <td style={{ padding: "11px 16px", fontSize: "13px", color: "#aaa", maxWidth: "280px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {m.notas || "—"}
                      </td>
                      <td style={{ padding: "11px 16px", textAlign: "right" }}>
                        <button onClick={() => handleEliminarMovimiento(m)}
                          style={{ padding: "5px 12px", borderRadius: "6px", border: "1px solid #fca5a5", backgroundColor: "#fff5f5", color: "#dc2626", fontSize: "12px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginacionControls
              page={page} totalPages={totalPages} total={total} pageSize={pageSize}
              onPageChange={goToPage} onPageSizeChange={setPageSize}
            />
          </>
        )}
      </div>

      {modalMov !== null && (
        <StockMovimientoModal
          tipo={modalMov}
          articulo={articulo}
          onClose={() => setModalMov(null)}
          onSaved={() => { goToPage(0); onActualizado() }}
        />
      )}
    </div>
  )
}

// ─── Barra de resumen colapsable ──────────────────────────────────────────────

function BarraResumen({ resumen, recientes }: { resumen: ResumenStock; recientes: MovimientoReciente[] }) {
  const hayAlertas = resumen.articulos_bajo_minimo > 0 || resumen.articulos_sin_stock > 0
  const [open, setOpen] = useState(hayAlertas)

  const stats = [
    { label: "Artículos", value: resumen.total_articulos },
    { label: "Stock bajo / sin stock", value: `${resumen.articulos_bajo_minimo} / ${resumen.articulos_sin_stock}`, warn: resumen.articulos_bajo_minimo > 0 || resumen.articulos_sin_stock > 0 },
    { label: "Entradas este mes", value: resumen.total_entradas_mes },
    { label: "Salidas este mes", value: resumen.total_salidas_mes },
  ]

  return (
    <div style={{ backgroundColor: "#fff", borderBottom: "1px solid #e8e8e8" }}>
      <div style={{ maxWidth: "1300px", margin: "0 auto", padding: "0 24px" }}>
        <button onClick={() => setOpen(o => !o)}
          style={{ display: "flex", alignItems: "center", gap: "8px", padding: "11px 0", border: "none", backgroundColor: "transparent", cursor: "pointer", color: "#888", fontSize: "13px", fontWeight: 500 }}>
          <span style={{ display: "inline-block", transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s", fontSize: "9px" }}>▶</span>
          Resumen del almacén
          {(resumen.articulos_bajo_minimo > 0 || resumen.articulos_sin_stock > 0) && (
            <span style={{ backgroundColor: "#fee2e2", color: "#991b1b", fontSize: "11px", fontWeight: 700, padding: "1px 7px", borderRadius: "20px" }}>
              ⚠ {resumen.articulos_bajo_minimo + resumen.articulos_sin_stock} artículos
            </span>
          )}
        </button>

        {open && (
          <div style={{ paddingBottom: "20px", display: "grid", gridTemplateColumns: "auto 1fr", gap: "24px", alignItems: "start" }}>
            <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
              {stats.map(s => (
                <div key={s.label}>
                  <div style={{ fontSize: "10px", color: "#bbb", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "2px" }}>{s.label}</div>
                  <div style={{ fontSize: "20px", fontWeight: 800, color: s.warn ? "#dc2626" : "#111" }}>{s.value}</div>
                </div>
              ))}
            </div>

            {recientes.length > 0 && (
              <div style={{ borderLeft: "1px solid #f0f0f0", paddingLeft: "24px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#bbb", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>Últimos movimientos</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                  {recientes.map(m => (
                    <div key={m.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
                      <span style={{
                        display: "inline-block", width: "52px", textAlign: "center", padding: "1px 0", borderRadius: "3px", fontSize: "10px", fontWeight: 700,
                        backgroundColor: m.tipo === "entrada" ? "#dcfce7" : "#fee2e2",
                        color: m.tipo === "entrada" ? "#166534" : "#991b1b",
                      }}>
                        {m.tipo === "entrada" ? "↑ ENT" : "↓ SAL"}
                      </span>
                      <span style={{ fontWeight: 600, color: "#333" }}>{m.articulo_nombre}</span>
                      <span style={{ color: "#aaa" }}>{m.tipo === "entrada" ? "+" : "-"}{m.cantidad}</span>
                      <span style={{ color: "#ccc" }}>{fechaLocal(m.fecha)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Página principal ────────────────────────────────────────────────────────

export default function StockPage({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const [articulos, setArticulos] = useState<ArticuloStock[]>([])
  const [categorias, setCategorias] = useState<CategoriaStock[]>([])
  const [resumen, setResumen] = useState<ResumenStock>({
    total_articulos: 0, articulos_bajo_minimo: 0, articulos_sin_stock: 0,
    total_entradas_mes: 0, total_salidas_mes: 0,
  })
  const [recientes, setRecientes] = useState<MovimientoReciente[]>([])

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [busqueda, setBusqueda] = useState("")
  const [filtroCategoria, setFiltroCategoria] = useState<number | "">("")

  const [modalArticulo, setModalArticulo] = useState<ArticuloStock | null | "nuevo">(null)

  const { dialog } = useConfirm()

  // ── Carga de datos ──────────────────────────────────────────────────────────

  const recargarTodo = useCallback(() => {
    getArticulos(true).then(setArticulos)
    getCategorias().then(setCategorias)
    getResumen().then(setResumen)
    getMovimientosRecientes(8).then(setRecientes)
  }, [])

  useEffect(() => { recargarTodo() }, [])

  // Auto-seleccionar primero
  useEffect(() => {
    if (articulos.length > 0 && selectedId === null) {
      setSelectedId(articulos[0].id)
    }
  }, [articulos.length, selectedId])

  // ── Filtrado sidebar ────────────────────────────────────────────────────────

  const articulosFiltrados = articulos.filter(a => {
    const matchBusqueda = busqueda === "" || a.nombre.toLowerCase().includes(busqueda.toLowerCase())
    const matchCategoria = filtroCategoria === "" || a.categoria_id === filtroCategoria
    return matchBusqueda && matchCategoria
  })

  const articuloSeleccionado = articulos.find(a => a.id === selectedId) ?? null

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f2f2f2", fontFamily: "system-ui, sans-serif" }}>
      <AppHeader page="almacen" onNavigate={onNavigate} />

      <BarraResumen resumen={resumen} recientes={recientes} />

      <div style={{ maxWidth: "1300px", margin: "0 auto", padding: "20px 24px", display: "grid", gridTemplateColumns: "280px 1fr", gap: "16px", alignItems: "start" }}>

        {/* Sidebar */}
        <div style={{ backgroundColor: "#fff", borderRadius: "12px", border: "1px solid #e8e8e8", overflow: "hidden", position: "sticky", top: "20px" }}>
          <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid #f0f0f0" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#111" }}>
                Artículos
                <span style={{ fontSize: "12px", fontWeight: 400, color: "#ccc", marginLeft: "6px" }}>{articulos.length}</span>
              </span>
              <button onClick={() => setModalArticulo("nuevo")}
                style={{ padding: "5px 10px", borderRadius: "6px", border: "none", backgroundColor: ACENTO, color: "#fff", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
                + Añadir
              </button>
            </div>

            {categorias.length > 0 && (
              <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value === "" ? "" : Number(e.target.value))}
                style={{ width: "100%", padding: "6px 9px", borderRadius: "7px", border: "1px solid #e8e8e8", fontSize: "12px", backgroundColor: "#fafafa", color: filtroCategoria !== "" ? ACENTO : "#888", outline: "none", marginBottom: "8px", cursor: "pointer" }}>
                <option value="">Todas las categorías</option>
                {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            )}

            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: "9px", top: "50%", transform: "translateY(-50%)", fontSize: "12px", color: "#ccc", pointerEvents: "none" }}>🔍</span>
              <input
                value={busqueda} onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar artículo…"
                style={{ width: "100%", padding: "7px 10px 7px 28px", borderRadius: "7px", border: "1px solid #e8e8e8", fontSize: "12px", boxSizing: "border-box", outline: "none", backgroundColor: "#fafafa" }}
              />
            </div>
          </div>

          <div style={{ maxHeight: "calc(100vh - 260px)", overflowY: "auto" }}>
            {articulosFiltrados.length === 0 ? (
              <div style={{ padding: "30px", textAlign: "center", color: "#ccc", fontSize: "13px" }}>Sin resultados</div>
            ) : (
              articulosFiltrados.map((a, i) => {
                const selected = selectedId === a.id
                const { bg: sBg, color: sCol } = stockColor(a)
                return (
                  <button key={a.id} onClick={() => setSelectedId(a.id)}
                    style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", padding: "11px 14px", border: "none", backgroundColor: selected ? ACENTO + "0e" : "#fff", borderLeft: `3px solid ${selected ? ACENTO : "transparent"}`, cursor: "pointer", textAlign: "left", borderBottom: i < articulosFiltrados.length - 1 ? "1px solid #f9f9f9" : "none", transition: "background-color 0.1s" }}
                    onMouseEnter={e => { if (!selected) e.currentTarget.style.backgroundColor = "#fafafa" }}
                    onMouseLeave={e => { if (!selected) e.currentTarget.style.backgroundColor = "#fff" }}>
                    <div style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: a.stock_actual === 0 ? "#dc2626" : (a.stock_minimo !== null && a.stock_actual <= a.stock_minimo) ? "#f97316" : "#d1d5db", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "13px", fontWeight: selected ? 600 : 400, color: selected ? "#111" : "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {a.nombre}
                      </div>
                      {a.categoria_nombre && (
                        <div style={{ fontSize: "11px", color: "#bbb", marginTop: "1px" }}>{a.categoria_nombre}</div>
                      )}
                    </div>
                    <span style={{ fontSize: "12px", fontWeight: 700, padding: "2px 7px", borderRadius: "10px", backgroundColor: sBg, color: sCol, flexShrink: 0 }}>
                      {a.stock_actual} {a.unidad}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Panel detalle */}
        <div style={{ backgroundColor: "#fff", borderRadius: "12px", border: "1px solid #e8e8e8", minHeight: "500px", overflow: "hidden" }}>
          {articuloSeleccionado ? (
            <PanelArticulo
              key={articuloSeleccionado.id}
              articulo={articuloSeleccionado}
              onEdit={() => setModalArticulo(articuloSeleccionado)}
              onActualizado={recargarTodo}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "400px", color: "#ccc", fontSize: "14px", gap: "12px" }}>
              <span style={{ fontSize: "40px" }}>📦</span>
              Selecciona un artículo para ver su historial
            </div>
          )}
        </div>
      </div>

      {modalArticulo !== null && (
        <StockArticuloModal
          articulo={modalArticulo === "nuevo" ? null : modalArticulo}
          categorias={categorias}
          onClose={() => setModalArticulo(null)}
          onSaved={recargarTodo}
        />
      )}

      {dialog}
    </div>
  )
}
