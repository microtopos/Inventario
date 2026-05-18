import { useState, useEffect, useCallback, useRef } from "react"
import AppHeader from "./AppHeader"
import type { Page } from "./AppHeader"
import { useConfirm } from "./ConfirmDialog"
import { useToast } from "./Toast"
import { usePagination } from "./usePagination"
import {
  getVehiculos, crearVehiculo, actualizarVehiculo,
  desactivarVehiculo, reactivarVehiculo,
  getRepostajesPaginados, crearRepostaje, actualizarRepostaje, eliminarRepostaje,
  getResumenPorVehiculo, exportarDatos, importarDatos,
  type Vehiculo, type Repostaje, type FiltrosRepostaje, type ResumenVehiculo, type ExportData,
} from "./fuelService"
import {
  ResponsiveContainer, BarChart, Bar, CartesianGrid, Tooltip, XAxis, YAxis, Cell,
} from "recharts"

// ─── Constantes ───────────────────────────────────────────────────────────────

const COLORES_VEHICULO = [
  "#ea580c", "#2563eb", "#16a34a", "#9333ea",
  "#db2777", "#0891b2", "#ca8a04", "#dc2626",
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatEuro(n: number) {
  return n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"
}

function fechaHoy() {
  return new Date().toISOString().slice(0, 10)
}

function colorVehiculo(index: number) {
  return COLORES_VEHICULO[index % COLORES_VEHICULO.length]
}

// ─── Modal Vehículo ───────────────────────────────────────────────────────────

function ModalVehiculo({
  vehiculo, onClose, onSaved,
}: {
  vehiculo: Vehiculo | null; onClose: () => void; onSaved: () => void
}) {
  const toast = useToast()
  const [matricula, setMatricula] = useState(vehiculo?.matricula ?? "")
  const [nombre, setNombre] = useState(vehiculo?.nombre ?? "")
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    if (!matricula.trim() || !nombre.trim()) return
    setSaving(true)
    try {
      if (vehiculo) {
        await actualizarVehiculo(vehiculo.id, matricula, nombre)
        toast.success("Vehículo actualizado")
      } else {
        await crearVehiculo(matricula, nombre)
        toast.success("Vehículo creado")
      }
      onSaved(); onClose()
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.35)", zIndex: 300 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", backgroundColor: "#fff", borderRadius: "14px", width: "420px", maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 64px rgba(0,0,0,0.18)", zIndex: 301, overflow: "hidden" }}>
        <div style={{ height: "4px", backgroundColor: "#ea580c" }} />
        <div style={{ padding: "24px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 20px" }}>{vehiculo ? "Editar vehículo" : "Nuevo vehículo"}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", display: "block", marginBottom: "6px" }}>Matrícula</label>
              <input autoFocus value={matricula} onChange={e => setMatricula(e.target.value.toUpperCase())} onKeyDown={e => e.key === "Enter" && handleSubmit()} placeholder="1234 ABC"
                style={{ width: "100%", padding: "9px 12px", borderRadius: "7px", border: "1px solid #e0e0e0", fontSize: "14px", fontFamily: "monospace", boxSizing: "border-box", outline: "none", textTransform: "uppercase" }} />
            </div>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", display: "block", marginBottom: "6px" }}>Nombre / descripción</label>
              <input value={nombre} onChange={e => setNombre(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSubmit()} placeholder="Furgoneta almacén, Camión 1…"
                style={{ width: "100%", padding: "9px 12px", borderRadius: "7px", border: "1px solid #e0e0e0", fontSize: "14px", boxSizing: "border-box", outline: "none" }} />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
            <button onClick={onClose} style={{ padding: "9px 18px", borderRadius: "8px", border: "1px solid #e0e0e0", backgroundColor: "#fff", color: "#555", fontSize: "14px", cursor: "pointer" }}>Cancelar</button>
            <button onClick={handleSubmit} disabled={saving || !matricula.trim() || !nombre.trim()}
              style={{ padding: "9px 20px", borderRadius: "8px", border: "none", backgroundColor: matricula.trim() && nombre.trim() ? "#ea580c" : "#ccc", color: "#fff", fontSize: "14px", fontWeight: 600, cursor: matricula.trim() && nombre.trim() ? "pointer" : "not-allowed" }}>
              {saving ? "Guardando…" : "✓ Guardar"}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Modal Repostaje ──────────────────────────────────────────────────────────

function ModalRepostaje({
  repostaje, vehiculo, onClose, onSaved,
}: {
  repostaje: Repostaje | null; vehiculo: Vehiculo; onClose: () => void; onSaved: () => void
}) {
  const toast = useToast()
  const [fecha, setFecha] = useState(repostaje?.fecha ?? fechaHoy())
  const [coste, setCoste] = useState(repostaje ? String(repostaje.coste) : "")
  const [notas, setNotas] = useState(repostaje?.notas ?? "")
  const [saving, setSaving] = useState(false)

  const costeNum = parseFloat(coste.replace(",", "."))
  const valid = fecha && !isNaN(costeNum) && costeNum > 0

  async function handleSubmit() {
    if (!valid) return
    setSaving(true)
    try {
      if (repostaje) {
        await actualizarRepostaje(repostaje.id, { vehiculo_id: vehiculo.id, fecha, coste: costeNum, notas: notas || undefined })
        toast.success("Repostaje actualizado")
      } else {
        await crearRepostaje({ vehiculo_id: vehiculo.id, fecha, coste: costeNum, notas: notas || undefined })
        toast.success("Repostaje registrado")
      }
      onSaved(); onClose()
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.35)", zIndex: 300 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", backgroundColor: "#fff", borderRadius: "14px", width: "400px", maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 64px rgba(0,0,0,0.18)", zIndex: 301, overflow: "hidden" }}>
        <div style={{ height: "4px", backgroundColor: "#ea580c" }} />
        <div style={{ padding: "24px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 4px" }}>{repostaje ? "Editar repostaje" : "Registrar repostaje"}</h2>
          <div style={{ fontSize: "13px", color: "#888", marginBottom: "20px" }}>{vehiculo.nombre} · <span style={{ fontFamily: "monospace" }}>{vehiculo.matricula}</span></div>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", display: "block", marginBottom: "6px" }}>Fecha</label>
                <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "7px", border: "1px solid #e0e0e0", fontSize: "14px", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", display: "block", marginBottom: "6px" }}>Coste (€)</label>
                <input autoFocus type="number" min="0" step="0.01" value={coste} onChange={e => setCoste(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSubmit()} placeholder="0.00"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "7px", border: "1px solid #e0e0e0", fontSize: "14px", boxSizing: "border-box" }} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", display: "block", marginBottom: "6px" }}>Notas <span style={{ fontWeight: 400, color: "#aaa" }}>(opcional)</span></label>
              <input value={notas} onChange={e => setNotas(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSubmit()} placeholder="Gasolinera, tipo de combustible…"
                style={{ width: "100%", padding: "9px 12px", borderRadius: "7px", border: "1px solid #e0e0e0", fontSize: "14px", boxSizing: "border-box" }} />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
            <button onClick={onClose} style={{ padding: "9px 18px", borderRadius: "8px", border: "1px solid #e0e0e0", backgroundColor: "#fff", color: "#555", fontSize: "14px", cursor: "pointer" }}>Cancelar</button>
            <button onClick={handleSubmit} disabled={saving || !valid}
              style={{ padding: "9px 20px", borderRadius: "8px", border: "none", backgroundColor: valid && !saving ? "#ea580c" : "#ccc", color: "#fff", fontSize: "14px", fontWeight: 600, cursor: valid && !saving ? "pointer" : "not-allowed" }}>
              {saving ? "Guardando…" : "⛽ Guardar"}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Paginación ───────────────────────────────────────────────────────────────

function PaginacionControls({ page, totalPages, total, pageSize, onPageChange, onPageSizeChange }: {
  page: number; totalPages: number; total: number; pageSize: number
  onPageChange: (p: number) => void; onPageSizeChange: (s: number) => void
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", gap: "12px", flexWrap: "wrap" }}>
      <span style={{ fontSize: "12px", color: "#bbb" }}>{total} repostaje{total !== 1 ? "s" : ""} · p. {page + 1}/{totalPages}</span>
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <button onClick={() => onPageChange(page - 1)} disabled={page === 0}
          style={{ padding: "5px 10px", borderRadius: "6px", border: "1px solid #e0e0e0", backgroundColor: page === 0 ? "#f5f5f5" : "#fff", color: page === 0 ? "#ccc" : "#444", fontSize: "12px", cursor: page === 0 ? "not-allowed" : "pointer" }}>←</button>
        <select value={pageSize} onChange={e => onPageSizeChange(Number(e.target.value))}
          style={{ padding: "5px 8px", borderRadius: "6px", border: "1px solid #e0e0e0", fontSize: "12px", cursor: "pointer", backgroundColor: "#fff" }}>
          <option value={10}>10</option><option value={25}>25</option><option value={50}>50</option>
        </select>
        <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages - 1}
          style={{ padding: "5px 10px", borderRadius: "6px", border: "1px solid #e0e0e0", backgroundColor: page >= totalPages - 1 ? "#f5f5f5" : "#fff", color: page >= totalPages - 1 ? "#ccc" : "#444", fontSize: "12px", cursor: page >= totalPages - 1 ? "not-allowed" : "pointer" }}>→</button>
      </div>
    </div>
  )
}

// ─── Menú debug ···  ──────────────────────────────────────────────────────────

function MenuDebug({ onImportar, onExportar }: { onImportar: () => void; onExportar: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [])
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} title="Depuración"
        style={{ padding: "5px 9px", borderRadius: "6px", border: "1px solid #e8e8e8", backgroundColor: "#fff", color: "#ccc", fontSize: "15px", cursor: "pointer", letterSpacing: "2px", lineHeight: 1 }}>
        ···
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, backgroundColor: "#fff", border: "1px solid #e0e0e0", borderRadius: "10px", boxShadow: "0 8px 24px rgba(0,0,0,0.09)", minWidth: "170px", zIndex: 100, overflow: "hidden" }}>
          <div style={{ padding: "5px 12px 4px", fontSize: "10px", fontWeight: 700, color: "#ccc", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid #f0f0f0" }}>Depuración</div>
          {[{ label: "↑ Importar JSON", fn: onImportar }, { label: "↓ Exportar JSON", fn: onExportar }].map(item => (
            <button key={item.label} onClick={() => { item.fn(); setOpen(false) }}
              style={{ display: "block", width: "100%", padding: "9px 14px", border: "none", backgroundColor: "#fff", color: "#555", fontSize: "13px", textAlign: "left", cursor: "pointer" }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#f9f9f9")}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#fff")}>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Panel detalle de vehículo ────────────────────────────────────────────────

function PanelVehiculo({
  vehiculo, vehiculoIndex, onEdit, onDesactivar, onReactivar, onVehiculoUpdated,
}: {
  vehiculo: Vehiculo; vehiculoIndex: number
  onEdit: () => void; onDesactivar: () => void; onReactivar: () => void; onVehiculoUpdated: () => void
}) {
  const [modalRepostaje, setModalRepostaje] = useState<Repostaje | null | "nuevo">(null)
  const [filtroDesde, setFiltroDesde] = useState("")
  const [filtroHasta, setFiltroHasta] = useState("")
  const { confirm } = useConfirm()
  const toast = useToast()
  const color = colorVehiculo(vehiculoIndex)
  const activo = vehiculo.activo === 1

  const buildFiltros = useCallback((): FiltrosRepostaje => {
    const f: FiltrosRepostaje = { vehiculo_id: vehiculo.id }
    if (filtroDesde) f.fecha_desde = filtroDesde
    if (filtroHasta) f.fecha_hasta = filtroHasta
    return f
  }, [vehiculo.id, filtroDesde, filtroHasta])

  const fetchFn = useCallback(
    (pageSize: number, offset: number) => getRepostajesPaginados(buildFiltros(), pageSize, offset),
    [buildFiltros]
  )

  const { items: repostajes, total, page, pageSize, totalPages, loading, goToPage, setPageSize } = usePagination<Repostaje>({
    fetchFn, deps: [vehiculo.id, filtroDesde, filtroHasta], defaultPageSize: 25,
  })

  const totalGasto = repostajes.reduce((s, r) => s + r.coste, 0)
  const hayFiltros = filtroDesde || filtroHasta

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Cabecera */}
      <div style={{ padding: "22px 28px 18px", borderBottom: "1px solid #f0f0f0" }}>
        {/* Fila 1: icono + nombre/matrícula | botones */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px", minWidth: 0 }}>
            <div style={{ width: "42px", height: "42px", borderRadius: "10px", backgroundColor: color + "18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <div style={{ width: "13px", height: "13px", borderRadius: "50%", backgroundColor: color }} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ fontSize: "18px", fontWeight: 700, color: "#111", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{vehiculo.nombre}</div>
                {!activo && <span style={{ fontSize: "10px", fontWeight: 700, color: "#9ca3af", backgroundColor: "#f3f4f6", padding: "2px 7px", borderRadius: "4px", textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 }}>Inactivo</span>}
              </div>
              <div style={{ fontSize: "13px", color: "#888", fontFamily: "monospace", marginTop: "3px", textAlign: "left" }}>{vehiculo.matricula}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexShrink: 0 }}>
            {activo && (
              <button onClick={() => setModalRepostaje("nuevo")}
                style={{ display: "flex", alignItems: "center", gap: "7px", padding: "8px 16px", borderRadius: "8px", border: "none", backgroundColor: color, color: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                ⛽ Añadir repostaje
              </button>
            )}
            <button onClick={e => { e.stopPropagation(); onEdit() }}
              style={{ padding: "8px 13px", borderRadius: "8px", border: "1px solid #e0e0e0", backgroundColor: "#fff", color: "#555", fontSize: "13px", cursor: "pointer" }}>
              Editar
            </button>
            {activo ? (
              <button onClick={onDesactivar}
                style={{ padding: "8px 13px", borderRadius: "8px", border: "1px solid #fca5a5", backgroundColor: "#fff", color: "#dc2626", fontSize: "13px", cursor: "pointer" }}>
                Desactivar
              </button>
            ) : (
              <button onClick={onReactivar}
                style={{ padding: "8px 13px", borderRadius: "8px", border: "1px solid #86efac", backgroundColor: "#fff", color: "#16a34a", fontSize: "13px", cursor: "pointer" }}>
                Reactivar
              </button>
            )}
          </div>
        </div>

        {/* Resumen + filtros en la misma fila */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "16px", flexWrap: "wrap", gap: "10px" }}>
          {total > 0 && (
            <div style={{ display: "flex", gap: "20px" }}>
              {[
                { label: "Repostajes", value: total },
                { label: hayFiltros ? "Gasto filtrado" : "Gasto total", value: formatEuro(totalGasto) },
                { label: "Media", value: repostajes.length > 0 ? formatEuro(totalGasto / repostajes.length) : "—" },
              ].map(c => (
                <div key={c.label}>
                  <div style={{ fontSize: "10px", color: "#bbb", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "2px" }}>{c.label}</div>
                  <div style={{ fontSize: "15px", fontWeight: 700, color: "#111" }}>{c.value}</div>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
            <input type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)}
              style={{ padding: "6px 9px", borderRadius: "6px", border: `1px solid ${filtroDesde ? color : "#e0e0e0"}`, fontSize: "12px", backgroundColor: filtroDesde ? color + "10" : "#fff", outline: "none" }} />
            <span style={{ color: "#ccc", fontSize: "12px" }}>→</span>
            <input type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)}
              style={{ padding: "6px 9px", borderRadius: "6px", border: `1px solid ${filtroHasta ? color : "#e0e0e0"}`, fontSize: "12px", backgroundColor: filtroHasta ? color + "10" : "#fff", outline: "none" }} />
            {hayFiltros && (
              <button onClick={() => { setFiltroDesde(""); setFiltroHasta("") }}
                style={{ padding: "6px 9px", borderRadius: "6px", border: "1px solid #e0e0e0", backgroundColor: "#fff", color: "#888", fontSize: "12px", cursor: "pointer" }}>✕</button>
            )}
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div style={{ padding: "0 28px 24px" }}>
        {loading ? (
          <div style={{ padding: "60px", textAlign: "center", color: "#ccc", fontSize: "14px" }}>Cargando…</div>
        ) : repostajes.length === 0 ? (
          <div style={{ padding: "60px 20px", textAlign: "center", color: "#ccc", fontSize: "14px", border: "1px dashed #e8e8e8", borderRadius: "10px", marginTop: "16px" }}>
            <div style={{ fontSize: "36px", marginBottom: "10px" }}>⛽</div>
            {hayFiltros ? "Sin repostajes en ese período." : "Sin repostajes todavía. ¡Añade el primero!"}
          </div>
        ) : (
          <>
            <div style={{ backgroundColor: "#fff", border: "1px solid #f0f0f0", borderRadius: "10px", overflow: "hidden", marginTop: "16px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ backgroundColor: "#fafafa", borderBottom: "1px solid #f0f0f0" }}>
                    {["Fecha", "Coste", "Notas", ""].map(h => (
                      <th key={h} style={{ padding: "9px 16px", textAlign: "left", fontSize: "10px", fontWeight: 700, color: "#bbb", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {repostajes.map(r => (
                    <tr key={r.id} style={{ borderBottom: "1px solid #f9f9f9" }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#fafafa")}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = "")}>
                      <td style={{ padding: "11px 16px", fontSize: "13px", color: "#555", whiteSpace: "nowrap" }}>
                        {new Date(r.fecha + "T00:00:00").toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" })}
                      </td>
                      <td style={{ padding: "11px 16px", fontSize: "15px", fontWeight: 700, color: color, whiteSpace: "nowrap" }}>{formatEuro(r.coste)}</td>
                      <td style={{ padding: "11px 16px", fontSize: "13px", color: "#aaa", maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.notas || "—"}</td>
                      <td style={{ padding: "11px 16px", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                          <button onClick={() => setModalRepostaje(r)}
                            style={{ padding: "4px 10px", borderRadius: "5px", border: "1px solid #e8e8e8", backgroundColor: "#fff", color: "#555", fontSize: "12px", cursor: "pointer" }}>Editar</button>
                          <button onClick={async () => {
                            const ok = await confirm(`¿Eliminar repostaje de ${formatEuro(r.coste)}?`, { confirmLabel: "Eliminar", danger: true })
                            if (!ok) return
                            await eliminarRepostaje(r.id)
                            toast.success("Repostaje eliminado")
                            goToPage(page)
                            onVehiculoUpdated()
                          }}
                            style={{ padding: "4px 10px", borderRadius: "5px", border: "1px solid #fca5a5", backgroundColor: "#fff", color: "#dc2626", fontSize: "12px", cursor: "pointer" }}>✕</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginacionControls page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPageChange={goToPage} onPageSizeChange={setPageSize} />
          </>
        )}
      </div>

      {modalRepostaje !== null && (
        <ModalRepostaje
          repostaje={modalRepostaje === "nuevo" ? null : modalRepostaje}
          vehiculo={vehiculo}
          onClose={() => setModalRepostaje(null)}
          onSaved={() => { goToPage(page); onVehiculoUpdated() }}
        />
      )}
    </div>
  )
}

// ─── Página principal ────────────────────────────────────────────────────────

export default function GasolinaPage({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [busqueda, setBusqueda] = useState("")
  const [modalVehiculo, setModalVehiculo] = useState<Vehiculo | null | "nuevo">(null)
  const [statsOpen, setStatsOpen] = useState(false)
  const [mostrarInactivos, setMostrarInactivos] = useState(false)

  const [gastoPorVehiculo, setGastoPorVehiculo] = useState<ResumenVehiculo[]>([])
  const [totalConsumo, setTotalConsumo] = useState<number>(0)
  const [filtroStatsDesde, setFiltroStatsDesde] = useState("")
  const [filtroStatsHasta, setFiltroStatsHasta] = useState("")

  const { confirm, dialog } = useConfirm()
  const toast = useToast()

  const recargarVehiculos = useCallback(() => {
    getVehiculos(false).then(setVehiculos)
  }, [])

  useEffect(() => { recargarVehiculos() }, [])

  const cargarEstadisticas = useCallback(() => {
    const filtros: FiltrosRepostaje = {}
    if (filtroStatsDesde) filtros.fecha_desde = filtroStatsDesde
    if (filtroStatsHasta) filtros.fecha_hasta = filtroStatsHasta
    getResumenPorVehiculo(filtros).then(res => {
      setGastoPorVehiculo(res)
      setTotalConsumo(res.reduce((s, r) => s + (r.gasto_total ?? 0), 0))
    }).catch(e => toast.error("Error", e?.message ?? String(e)))
  }, [filtroStatsDesde, filtroStatsHasta])

  useEffect(() => { cargarEstadisticas() }, [cargarEstadisticas])

  // Auto-seleccionar el primero al cargar o al cambiar de pestaña
  const vehiculosVisibles = vehiculos.filter(v => mostrarInactivos ? v.activo === 0 : v.activo === 1)
  useEffect(() => {
    setSelectedId(null)
  }, [mostrarInactivos])
  useEffect(() => {
    if (vehiculosVisibles.length > 0 && selectedId === null) {
      setSelectedId(vehiculosVisibles[0].id)
    }
  }, [vehiculosVisibles.length, selectedId])

  async function handleDesactivar(v: Vehiculo) {
    const ok = await confirm(`¿Desactivar "${v.nombre}"?`, { confirmLabel: "Desactivar", danger: true, detail: "El historial de repostajes se conserva." })
    if (!ok) return
    await desactivarVehiculo(v.id)
    toast.success("Vehículo desactivado")
    recargarVehiculos()
    cargarEstadisticas()
    setSelectedId(null)
  }

  async function handleReactivar(v: Vehiculo) {
    const ok = await confirm(`¿Reactivar "${v.nombre}"?`, { confirmLabel: "Reactivar" })
    if (!ok) return
    await reactivarVehiculo(v.id)
    toast.success("Vehículo reactivado")
    recargarVehiculos()
    cargarEstadisticas()
    setSelectedId(null)
  }

  async function handleExportar() {
    try {
      const data = await exportarDatos()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url; a.download = `gasolina_backup_${new Date().toISOString().slice(0, 10)}.json`; a.click()
      URL.revokeObjectURL(url)
      toast.success(`Exportado: ${data.vehiculos.length} vehículos, ${data.repostajes.length} repostajes`)
    } catch (e: any) { toast.error("Error al exportar", e?.message ?? String(e)) }
  }

  function handleImportar() {
    const input = document.createElement("input")
    input.type = "file"; input.accept = ".json,application/json"
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return
      try {
        const data: ExportData = JSON.parse(await file.text())
        const result = await importarDatos(data)
        toast.success(`Importación completada: ${result.vehiculosInsertados} vehículos, ${result.repostalesInsertados} repostajes`)
        recargarVehiculos(); cargarEstadisticas()
      } catch (e: any) { toast.error("Error al importar", e?.message ?? String(e)) }
    }
    input.click()
  }

  const vehiculosFiltrados = vehiculosVisibles.filter(v =>
    busqueda === "" ||
    v.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    v.matricula.toLowerCase().includes(busqueda.toLowerCase())
  )

  const vehiculoSeleccionado = vehiculos.find(v => v.id === selectedId) ?? null
  const vehiculoIndex = vehiculosVisibles.findIndex(v => v.id === selectedId)

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f2f2f2", fontFamily: "system-ui, sans-serif" }}>
      <AppHeader page="gasolina" onNavigate={onNavigate} />

      {/* ── Barra de estadísticas colapsable ── */}
      <div style={{ backgroundColor: "#fff", borderBottom: "1px solid #e8e8e8" }}>
        <div style={{ maxWidth: "1300px", margin: "0 auto", padding: "0 24px" }}>
          <button onClick={() => setStatsOpen(o => !o)}
            style={{ display: "flex", alignItems: "center", gap: "8px", padding: "11px 0", border: "none", backgroundColor: "transparent", cursor: "pointer", color: "#888", fontSize: "13px", fontWeight: 500 }}>
            <span style={{ display: "inline-block", transform: statsOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s", fontSize: "9px" }}>▶</span>
            Resumen general
            <span style={{ color: "#ea580c", fontWeight: 700, marginLeft: "4px" }}>{formatEuro(totalConsumo)}</span>
          </button>
          {statsOpen && (
            <div style={{ paddingBottom: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <span style={{ fontSize: "12px", color: "#bbb" }}>Período:</span>
                <input type="date" value={filtroStatsDesde} onChange={e => setFiltroStatsDesde(e.target.value)}
                  style={{ padding: "5px 9px", borderRadius: "6px", border: `1px solid ${filtroStatsDesde ? "#ea580c" : "#e0e0e0"}`, fontSize: "12px", backgroundColor: filtroStatsDesde ? "#fff7ed" : "#fff" }} />
                <span style={{ color: "#ccc" }}>→</span>
                <input type="date" value={filtroStatsHasta} onChange={e => setFiltroStatsHasta(e.target.value)}
                  style={{ padding: "5px 9px", borderRadius: "6px", border: `1px solid ${filtroStatsHasta ? "#ea580c" : "#e0e0e0"}`, fontSize: "12px", backgroundColor: filtroStatsHasta ? "#fff7ed" : "#fff" }} />
                {(filtroStatsDesde || filtroStatsHasta) && (
                  <button onClick={() => { setFiltroStatsDesde(""); setFiltroStatsHasta("") }}
                    style={{ padding: "5px 9px", borderRadius: "6px", border: "1px solid #e0e0e0", backgroundColor: "#fff", color: "#888", fontSize: "12px", cursor: "pointer" }}>✕</button>
                )}
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={gastoPorVehiculo.filter(r => r.gasto_total > 0)} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="vehiculo_nombre" tick={{ fontSize: 11, fill: "#bbb" }} />
                  <YAxis tickFormatter={v => `${v}€`} tick={{ fontSize: 11, fill: "#bbb" }} />
                  <Tooltip formatter={(v: number) => formatEuro(v)} />
                  <Bar dataKey="gasto_total" name="Gasto total" radius={[4, 4, 0, 0]}>
                    {gastoPorVehiculo.filter(r => r.gasto_total > 0).map((_, i) => (
                      <Cell key={i} fill={colorVehiculo(i)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* ── Layout dos columnas ── */}
      <div style={{ maxWidth: "1300px", margin: "0 auto", padding: "20px 24px", display: "grid", gridTemplateColumns: "280px 1fr", gap: "16px", alignItems: "start" }}>

        {/* Columna izquierda: lista de vehículos */}
        <div style={{ backgroundColor: "#fff", borderRadius: "12px", border: "1px solid #e8e8e8", overflow: "hidden", position: "sticky", top: "20px" }}>
          <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid #f0f0f0" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#111" }}>
                Vehículos
                <span style={{ fontSize: "12px", fontWeight: 400, color: "#ccc", marginLeft: "6px" }}>{vehiculosVisibles.length}</span>
              </span>
              <div style={{ display: "flex", gap: "6px" }}>
                <MenuDebug onImportar={handleImportar} onExportar={handleExportar} />
                {!mostrarInactivos && (
                  <button onClick={() => setModalVehiculo("nuevo")}
                    style={{ padding: "5px 10px", borderRadius: "6px", border: "none", backgroundColor: "#ea580c", color: "#fff", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
                    + Añadir
                  </button>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: "0", marginBottom: "10px", border: "1px solid #e8e8e8", borderRadius: "7px", overflow: "hidden" }}>
              {(["activos", "inactivos"] as const).map(tab => (
                <button key={tab} onClick={() => setMostrarInactivos(tab === "inactivos")}
                  style={{ flex: 1, padding: "5px 0", border: "none", fontSize: "12px", fontWeight: 500, cursor: "pointer", backgroundColor: (tab === "inactivos") === mostrarInactivos ? "#ea580c" : "#fff", color: (tab === "inactivos") === mostrarInactivos ? "#fff" : "#888", transition: "background-color 0.15s" }}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: "9px", top: "50%", transform: "translateY(-50%)", fontSize: "12px", color: "#ccc", pointerEvents: "none" }}>🔍</span>
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por nombre o matrícula…"
                style={{ width: "100%", padding: "7px 10px 7px 28px", borderRadius: "7px", border: "1px solid #e8e8e8", fontSize: "12px", boxSizing: "border-box", outline: "none", backgroundColor: "#fafafa" }} />
            </div>
          </div>

          <div style={{ maxHeight: "calc(100vh - 260px)", overflowY: "auto" }}>
            {vehiculosFiltrados.length === 0 ? (
              <div style={{ padding: "30px", textAlign: "center", color: "#ccc", fontSize: "13px" }}>Sin resultados</div>
            ) : (
              vehiculosFiltrados.map((v, i) => {
                const realIndex = vehiculosVisibles.findIndex(vv => vv.id === v.id)
                const color = colorVehiculo(realIndex)
                const selected = selectedId === v.id
                const resumen = gastoPorVehiculo.find(r => r.vehiculo_id === v.id)
                return (
                  <button key={v.id} onClick={() => setSelectedId(v.id)}
                    style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", padding: "11px 14px", border: "none", backgroundColor: selected ? color + "0e" : "#fff", borderLeft: `3px solid ${selected ? color : "transparent"}`, cursor: "pointer", textAlign: "left", borderBottom: i < vehiculosFiltrados.length - 1 ? "1px solid #f9f9f9" : "none", transition: "background-color 0.1s" }}
                    onMouseEnter={e => { if (!selected) e.currentTarget.style.backgroundColor = "#fafafa" }}
                    onMouseLeave={e => { if (!selected) e.currentTarget.style.backgroundColor = "#fff" }}>
                    <div style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: color, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "13px", fontWeight: selected ? 600 : 400, color: selected ? "#111" : "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {v.nombre}
                      </div>
                      <div style={{ fontSize: "13px", color: "#666", fontFamily: "monospace", marginTop: "2px" }}>{v.matricula}</div>
                    </div>
                    {resumen?.gasto_total ? (
                      <div style={{ fontSize: "11px", color: "#bbb", whiteSpace: "nowrap", flexShrink: 0 }}>{formatEuro(resumen.gasto_total)}</div>
                    ) : null}
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Columna derecha: panel detalle */}
        <div style={{ backgroundColor: "#fff", borderRadius: "12px", border: "1px solid #e8e8e8", minHeight: "500px", overflow: "hidden" }}>
          {vehiculoSeleccionado ? (
            <PanelVehiculo
              key={vehiculoSeleccionado.id}
              vehiculo={vehiculoSeleccionado}
              vehiculoIndex={vehiculoIndex}
              onEdit={() => setModalVehiculo(vehiculoSeleccionado)}
              onDesactivar={() => handleDesactivar(vehiculoSeleccionado)}
              onReactivar={() => handleReactivar(vehiculoSeleccionado)}
              onVehiculoUpdated={cargarEstadisticas}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "400px", color: "#ccc", fontSize: "14px", gap: "12px" }}>
              <span style={{ fontSize: "40px" }}>🚗</span>
              Selecciona un vehículo para ver sus repostajes
            </div>
          )}
        </div>
      </div>

      {modalVehiculo !== null && (
        <ModalVehiculo
          vehiculo={modalVehiculo === "nuevo" ? null : modalVehiculo}
          onClose={() => setModalVehiculo(null)}
          onSaved={() => { recargarVehiculos(); cargarEstadisticas() }}
        />
      )}
      {dialog}
    </div>
  )
}
