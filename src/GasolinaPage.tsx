import { useState, useEffect, useCallback } from "react"
import AppHeader from "./AppHeader"
import type { Page } from "./AppHeader"
import { useConfirm } from "./ConfirmDialog"
import { useToast } from "./Toast"
import {
  getVehiculos, crearVehiculo, actualizarVehiculo,
  desactivarVehiculo, reactivarVehiculo,
  getRepostajes, crearRepostaje, actualizarRepostaje, eliminarRepostaje,
  getGastoMensual, getResumenPorVehiculo,
  type Vehiculo, type Repostaje, type FiltrosRepostaje,
} from "./gasolinaService"
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts"

// ─── Constantes ───────────────────────────────────────────────────────────────

type SubPage = "repostajes" | "vehiculos" | "estadisticas"

const MESES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
]

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

function anioActual() {
  return new Date().getFullYear()
}

// ─── Subcomponente: Modal de Vehículo ─────────────────────────────────────────

function ModalVehiculo({
  vehiculo,
  onClose,
  onSaved,
}: {
  vehiculo: Vehiculo | null
  onClose: () => void
  onSaved: () => void
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
        <div style={{ height: "4px", backgroundColor: "#ea580c" }} />
        <div style={{ padding: "24px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 20px" }}>
            {vehiculo ? "Editar vehículo" : "Nuevo vehículo"}
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", display: "block", marginBottom: "6px" }}>
                Matrícula
              </label>
              <input
                autoFocus
                value={matricula}
                onChange={e => setMatricula(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
                placeholder="1234 ABC"
                style={{ width: "100%", padding: "9px 12px", borderRadius: "7px", border: "1px solid #e0e0e0", fontSize: "14px", fontFamily: "monospace", boxSizing: "border-box", outline: "none", textTransform: "uppercase" }}
              />
            </div>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", display: "block", marginBottom: "6px" }}>
                Nombre / descripción
              </label>
              <input
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
                placeholder="Furgoneta almacén, Camión 1…"
                style={{ width: "100%", padding: "9px 12px", borderRadius: "7px", border: "1px solid #e0e0e0", fontSize: "14px", boxSizing: "border-box", outline: "none" }}
              />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
            <button onClick={onClose} style={{ padding: "9px 18px", borderRadius: "8px", border: "1px solid #e0e0e0", backgroundColor: "#fff", color: "#555", fontSize: "14px", cursor: "pointer" }}>
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || !matricula.trim() || !nombre.trim()}
              style={{ padding: "9px 20px", borderRadius: "8px", border: "none", backgroundColor: matricula.trim() && nombre.trim() ? "#ea580c" : "#ccc", color: "#fff", fontSize: "14px", fontWeight: 600, cursor: matricula.trim() && nombre.trim() ? "pointer" : "not-allowed" }}
            >
              {saving ? "Guardando…" : "✓ Guardar"}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Subcomponente: Modal de Repostaje ────────────────────────────────────────

function ModalRepostaje({
  repostaje,
  vehiculos,
  defaultVehiculoId,
  onClose,
  onSaved,
}: {
  repostaje: Repostaje | null
  vehiculos: Vehiculo[]
  defaultVehiculoId?: number
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const [vehiculoId, setVehiculoId] = useState<number>(
    repostaje?.vehiculo_id ?? defaultVehiculoId ?? vehiculos[0]?.id ?? 0
  )
  const [fecha, setFecha] = useState(repostaje?.fecha ?? fechaHoy())
  const [coste, setCoste] = useState(repostaje ? String(repostaje.coste) : "")
  const [notas, setNotas] = useState(repostaje?.notas ?? "")
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    const costeNum = parseFloat(coste.replace(",", "."))
    if (!vehiculoId || !fecha || isNaN(costeNum) || costeNum <= 0) return
    setSaving(true)
    try {
      if (repostaje) {
        await actualizarRepostaje(repostaje.id, { vehiculo_id: vehiculoId, fecha, coste: costeNum, notas: notas || undefined })
        toast.success("Repostaje actualizado")
      } else {
        await crearRepostaje({ vehiculo_id: vehiculoId, fecha, coste: costeNum, notas: notas || undefined })
        toast.success("Repostaje registrado")
      }
      onSaved()
      onClose()
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    } finally {
      setSaving(false)
    }
  }

  const costeNum = parseFloat(coste.replace(",", "."))
  const valid = vehiculoId > 0 && fecha && !isNaN(costeNum) && costeNum > 0

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.35)", zIndex: 300 }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        backgroundColor: "#fff", borderRadius: "14px", width: "440px",
        maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
        zIndex: 301, overflow: "hidden",
      }}>
        <div style={{ height: "4px", backgroundColor: "#ea580c" }} />
        <div style={{ padding: "24px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 20px" }}>
            {repostaje ? "Editar repostaje" : "Registrar repostaje"}
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", display: "block", marginBottom: "6px" }}>Vehículo</label>
              <select
                value={vehiculoId}
                onChange={e => setVehiculoId(Number(e.target.value))}
                style={{ width: "100%", padding: "9px 12px", borderRadius: "7px", border: "1px solid #e0e0e0", fontSize: "14px", boxSizing: "border-box", backgroundColor: "#fff" }}
              >
                {vehiculos.map(v => (
                  <option key={v.id} value={v.id}>{v.nombre} — {v.matricula}</option>
                ))}
              </select>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", display: "block", marginBottom: "6px" }}>Fecha</label>
                <input
                  type="date"
                  value={fecha}
                  onChange={e => setFecha(e.target.value)}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "7px", border: "1px solid #e0e0e0", fontSize: "14px", boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", display: "block", marginBottom: "6px" }}>Coste (€)</label>
                <input
                  autoFocus={!repostaje}
                  type="number"
                  min="0"
                  step="0.01"
                  value={coste}
                  onChange={e => setCoste(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSubmit()}
                  placeholder="0.00"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "7px", border: "1px solid #e0e0e0", fontSize: "14px", boxSizing: "border-box" }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", display: "block", marginBottom: "6px" }}>
                Notas <span style={{ fontWeight: 400, color: "#aaa" }}>(opcional)</span>
              </label>
              <input
                value={notas}
                onChange={e => setNotas(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
                placeholder="Gasolinera, tipo de combustible…"
                style={{ width: "100%", padding: "9px 12px", borderRadius: "7px", border: "1px solid #e0e0e0", fontSize: "14px", boxSizing: "border-box" }}
              />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
            <button onClick={onClose} style={{ padding: "9px 18px", borderRadius: "8px", border: "1px solid #e0e0e0", backgroundColor: "#fff", color: "#555", fontSize: "14px", cursor: "pointer" }}>
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || !valid}
              style={{ padding: "9px 20px", borderRadius: "8px", border: "none", backgroundColor: valid && !saving ? "#ea580c" : "#ccc", color: "#fff", fontSize: "14px", fontWeight: 600, cursor: valid && !saving ? "pointer" : "not-allowed" }}
            >
              {saving ? "Guardando…" : "✓ Guardar"}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Vista: Vehículos ─────────────────────────────────────────────────────────

function VistaVehiculos() {
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([])
  const [mostrarInactivos, setMostrarInactivos] = useState(false)
  const [modalVehiculo, setModalVehiculo] = useState<Vehiculo | null | "nuevo">(null)
  const { confirm } = useConfirm()
  const toast = useToast()

  async function cargar() {
    setVehiculos(await getVehiculos(!mostrarInactivos ? true : false))
  }

  useEffect(() => { cargar() }, [mostrarInactivos])

  async function handleDesactivar(v: Vehiculo) {
    const ok = await confirm(`¿Desactivar "${v.nombre}"?`, {
      confirmLabel: "Desactivar", danger: true,
      detail: "El historial de repostajes se conserva.",
    })
    if (!ok) return
    await desactivarVehiculo(v.id)
    toast.success("Vehículo desactivado")
    cargar()
  }

  async function handleReactivar(v: Vehiculo) {
    await reactivarVehiculo(v.id)
    toast.success("Vehículo reactivado")
    cargar()
  }

  const visibles = mostrarInactivos ? vehiculos : vehiculos.filter(v => v.activo === 1)

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 600, margin: 0 }}>Vehículos</h2>
          <span style={{ fontSize: "13px", color: "#aaa" }}>{visibles.length} vehículo{visibles.length !== 1 ? "s" : ""}</span>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            onClick={() => setMostrarInactivos(m => !m)}
            style={{ padding: "7px 14px", borderRadius: "7px", border: `1px solid ${mostrarInactivos ? "#ea580c" : "#e0e0e0"}`, backgroundColor: mostrarInactivos ? "#fff7ed" : "#fff", color: mostrarInactivos ? "#ea580c" : "#666", fontSize: "13px", cursor: "pointer", fontWeight: mostrarInactivos ? 600 : 400 }}
          >
            {mostrarInactivos ? "✓ Mostrando todos" : "Mostrar inactivos"}
          </button>
          <button
            onClick={() => setModalVehiculo("nuevo")}
            style={{ padding: "7px 16px", borderRadius: "7px", border: "none", backgroundColor: "#ea580c", color: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
          >
            + Nuevo vehículo
          </button>
        </div>
      </div>

      {/* Lista */}
      {visibles.length === 0 ? (
        <div style={{ padding: "60px 20px", textAlign: "center", color: "#aaa", fontSize: "14px", border: "1px dashed #e0e0e0", borderRadius: "10px", backgroundColor: "#fafafa" }}>
          <div style={{ fontSize: "40px", marginBottom: "12px" }}>🚗</div>
          No hay vehículos registrados. Pulsa "+ Nuevo vehículo" para empezar.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {visibles.map((v, i) => (
            <div
              key={v.id}
              style={{
                display: "flex", alignItems: "center", gap: "16px",
                padding: "16px 20px", borderRadius: "10px",
                backgroundColor: "#fff", border: "1px solid #e0e0e0",
                opacity: v.activo === 0 ? 0.55 : 1,
              }}
            >
              <div style={{
                width: "40px", height: "40px", borderRadius: "50%", flexShrink: 0,
                backgroundColor: COLORES_VEHICULO[i % COLORES_VEHICULO.length] + "22",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "20px",
              }}>
                🚗
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "15px", fontWeight: 600, color: "#111" }}>{v.nombre}</div>
                <div style={{ fontSize: "13px", color: "#888", fontFamily: "monospace", marginTop: "2px" }}>{v.matricula}</div>
              </div>
              {v.activo === 0 && (
                <span style={{ fontSize: "12px", fontWeight: 600, color: "#aaa", backgroundColor: "#f5f5f5", padding: "3px 10px", borderRadius: "20px" }}>
                  Inactivo
                </span>
              )}
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => setModalVehiculo(v)}
                  style={{ padding: "6px 14px", borderRadius: "7px", border: "1px solid #e0e0e0", backgroundColor: "#fff", color: "#444", fontSize: "13px", cursor: "pointer" }}
                >
                  ✏︎ Editar
                </button>
                {v.activo === 1 ? (
                  <button
                    onClick={() => handleDesactivar(v)}
                    style={{ padding: "6px 14px", borderRadius: "7px", border: "1px solid #fca5a5", backgroundColor: "#fff", color: "#dc2626", fontSize: "13px", cursor: "pointer" }}
                  >
                    Desactivar
                  </button>
                ) : (
                  <button
                    onClick={() => handleReactivar(v)}
                    style={{ padding: "6px 14px", borderRadius: "7px", border: "1px solid #86efac", backgroundColor: "#fff", color: "#16a34a", fontSize: "13px", cursor: "pointer" }}
                  >
                    Reactivar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modalVehiculo !== null && (
        <ModalVehiculo
          vehiculo={modalVehiculo === "nuevo" ? null : modalVehiculo}
          onClose={() => setModalVehiculo(null)}
          onSaved={cargar}
        />
      )}
    </div>
  )
}

// ─── Vista: Repostajes ────────────────────────────────────────────────────────

function VistaRepostajes({ vehiculos }: { vehiculos: Vehiculo[] }) {
  const [repostajes, setRepostajes] = useState<Repostaje[]>([])
  const [filtroVehiculo, setFiltroVehiculo] = useState<number | "">("")
  const [filtroDesde, setFiltroDesde] = useState("")
  const [filtroHasta, setFiltroHasta] = useState("")
  const [modal, setModal] = useState<Repostaje | null | "nuevo">(null)
  const { confirm } = useConfirm()
  const toast = useToast()

  const cargar = useCallback(async () => {
    const filtros: FiltrosRepostaje = {}
    if (filtroVehiculo) filtros.vehiculo_id = Number(filtroVehiculo)
    if (filtroDesde) filtros.fecha_desde = filtroDesde
    if (filtroHasta) filtros.fecha_hasta = filtroHasta
    setRepostajes(await getRepostajes(filtros))
  }, [filtroVehiculo, filtroDesde, filtroHasta])

  useEffect(() => { cargar() }, [cargar])

  async function handleEliminar(r: Repostaje) {
    const ok = await confirm(`¿Eliminar este repostaje de ${formatEuro(r.coste)}?`, {
      confirmLabel: "Eliminar", danger: true,
    })
    if (!ok) return
    await eliminarRepostaje(r.id)
    toast.success("Repostaje eliminado")
    cargar()
  }

  const totalFiltrado = repostajes.reduce((s, r) => s + r.coste, 0)

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={filtroVehiculo}
            onChange={e => setFiltroVehiculo(e.target.value === "" ? "" : Number(e.target.value))}
            style={{ padding: "8px 12px", borderRadius: "7px", border: `1px solid ${filtroVehiculo ? "#ea580c" : "#e0e0e0"}`, fontSize: "13px", backgroundColor: filtroVehiculo ? "#fff7ed" : "#fff", color: filtroVehiculo ? "#ea580c" : "#555", cursor: "pointer", fontWeight: filtroVehiculo ? 600 : 400 }}
          >
            <option value="">Todos los vehículos</option>
            {vehiculos.map(v => (
              <option key={v.id} value={v.id}>{v.nombre} — {v.matricula}</option>
            ))}
          </select>
          <input
            type="date"
            value={filtroDesde}
            onChange={e => setFiltroDesde(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: "7px", border: `1px solid ${filtroDesde ? "#ea580c" : "#e0e0e0"}`, fontSize: "13px", backgroundColor: filtroDesde ? "#fff7ed" : "#fff" }}
          />
          <span style={{ color: "#aaa", fontSize: "13px" }}>→</span>
          <input
            type="date"
            value={filtroHasta}
            onChange={e => setFiltroHasta(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: "7px", border: `1px solid ${filtroHasta ? "#ea580c" : "#e0e0e0"}`, fontSize: "13px", backgroundColor: filtroHasta ? "#fff7ed" : "#fff" }}
          />
          {(filtroVehiculo || filtroDesde || filtroHasta) && (
            <button
              onClick={() => { setFiltroVehiculo(""); setFiltroDesde(""); setFiltroHasta("") }}
              style={{ padding: "8px 12px", borderRadius: "7px", border: "1px solid #e0e0e0", backgroundColor: "#fff", color: "#888", fontSize: "13px", cursor: "pointer" }}
            >
              ✕ Limpiar
            </button>
          )}
        </div>
        <button
          onClick={() => setModal("nuevo")}
          style={{ padding: "8px 16px", borderRadius: "7px", border: "none", backgroundColor: "#ea580c", color: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
        >
          + Registrar repostaje
        </button>
      </div>

      {/* Resumen rápido */}
      {repostajes.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "16px" }}>
          {[
            { label: "Repostajes", value: repostajes.length },
            { label: "Gasto total", value: formatEuro(totalFiltrado) },
            { label: "Media por repostaje", value: formatEuro(totalFiltrado / repostajes.length) },
          ].map(card => (
            <div key={card.label} style={{ backgroundColor: "#fff", border: "1px solid #e0e0e0", borderRadius: "10px", padding: "16px 20px" }}>
              <div style={{ fontSize: "12px", color: "#888", marginBottom: "4px" }}>{card.label}</div>
              <div style={{ fontSize: "22px", fontWeight: 700, color: "#111" }}>{card.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabla */}
      {repostajes.length === 0 ? (
        <div style={{ padding: "60px 20px", textAlign: "center", color: "#aaa", fontSize: "14px", border: "1px dashed #e0e0e0", borderRadius: "10px", backgroundColor: "#fafafa" }}>
          <div style={{ fontSize: "40px", marginBottom: "12px" }}>⛽</div>
          No hay repostajes para los filtros seleccionados.
        </div>
      ) : (
        <div style={{ backgroundColor: "#fff", border: "1px solid #e0e0e0", borderRadius: "10px", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#fafafa", borderBottom: "1px solid #e0e0e0" }}>
                {["Fecha", "Vehículo", "Matrícula", "Coste", "Notas", ""].map(h => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: "11px", fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {repostajes.map((r, i) => (
                <tr
                  key={r.id}
                  style={{ borderBottom: "1px solid #f5f5f5" }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#fafafa")}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = "")}
                >
                  <td style={{ padding: "12px 16px", fontSize: "13px", color: "#555", whiteSpace: "nowrap" }}>
                    {new Date(r.fecha + "T00:00:00").toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" })}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: "14px", fontWeight: 600, color: "#111" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: COLORES_VEHICULO[vehiculos.findIndex(v => v.id === r.vehiculo_id) % COLORES_VEHICULO.length], flexShrink: 0 }} />
                      {r.vehiculo_nombre}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: "13px", color: "#888", fontFamily: "monospace" }}>
                    {r.vehiculo_matricula}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: "15px", fontWeight: 700, color: "#ea580c", whiteSpace: "nowrap" }}>
                    {formatEuro(r.coste)}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: "13px", color: "#888", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.notas || "—"}
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>
                    <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                      <button
                        onClick={() => setModal(r)}
                        style={{ padding: "5px 12px", borderRadius: "6px", border: "1px solid #e0e0e0", backgroundColor: "#fff", color: "#444", fontSize: "12px", cursor: "pointer" }}
                      >
                        ✏︎
                      </button>
                      <button
                        onClick={() => handleEliminar(r)}
                        style={{ padding: "5px 12px", borderRadius: "6px", border: "1px solid #fca5a5", backgroundColor: "#fff", color: "#dc2626", fontSize: "12px", cursor: "pointer" }}
                      >
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal !== null && (
        <ModalRepostaje
          repostaje={modal === "nuevo" ? null : modal}
          vehiculos={vehiculos}
          defaultVehiculoId={filtroVehiculo ? Number(filtroVehiculo) : undefined}
          onClose={() => setModal(null)}
          onSaved={cargar}
        />
      )}
    </div>
  )
}

// ─── Vista: Estadísticas ──────────────────────────────────────────────────────

function VistaEstadisticas({ vehiculos }: { vehiculos: Vehiculo[] }) {
  const [anio, setAnio] = useState(anioActual())
  const [gastoMensual, setGastoMensual] = useState<any[]>([])
  const [resumenes, setResumenes] = useState<any[]>([])

  useEffect(() => {
    const desde = `${anio}-01-01`
    const hasta = `${anio}-12-31`

    Promise.all([
      getGastoMensual({ fecha_desde: desde, fecha_hasta: hasta }),
      getResumenPorVehiculo({ fecha_desde: desde, fecha_hasta: hasta }),
    ]).then(([gasto, res]) => {
      // Pivota los datos de gasto mensual para Recharts
      const porMes: Record<number, any> = {}
      for (let m = 1; m <= 12; m++) {
        porMes[m] = { mes: MESES[m - 1] }
      }
      for (const row of gasto) {
        porMes[row.mes][row.vehiculo_nombre] = row.total
      }
      setGastoMensual(Object.values(porMes))
      setResumenes(res)
    })
  }, [anio])

  const aniosPosibles = Array.from({ length: 5 }, (_, i) => anioActual() - i)
  const gastoTotal = resumenes.reduce((s, r) => s + (r.gasto_total ?? 0), 0)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* Selector de año */}
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <span style={{ fontSize: "13px", color: "#888", fontWeight: 500 }}>Año:</span>
        {aniosPosibles.map(a => (
          <button
            key={a}
            onClick={() => setAnio(a)}
            style={{ padding: "6px 14px", borderRadius: "7px", border: `1px solid ${anio === a ? "#ea580c" : "#e0e0e0"}`, backgroundColor: anio === a ? "#fff7ed" : "#fff", color: anio === a ? "#ea580c" : "#666", fontSize: "13px", fontWeight: anio === a ? 700 : 400, cursor: "pointer" }}
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

// ─── Página principal ─────────────────────────────────────────────────────────

export default function GasolinaPage({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const [subPage, setSubPage] = useState<SubPage>("repostajes")
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([])

  useEffect(() => {
    getVehiculos(true).then(setVehiculos)
  }, [])

  const SUB_TABS: { key: SubPage; label: string }[] = [
    { key: "repostajes",   label: "⛽ Repostajes" },
    { key: "vehiculos",    label: "🚗 Vehículos" },
    { key: "estadisticas", label: "📊 Estadísticas" },
  ]

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f5f5f5", fontFamily: "system-ui, sans-serif" }}>
      <AppHeader page="gasolina" onNavigate={onNavigate} />

      {/* Sub-navegación */}
      <div style={{ backgroundColor: "#fff", borderBottom: "1px solid #e0e0e0", padding: "0 32px", display: "flex", alignItems: "center", height: "48px", gap: "4px" }}>
        {SUB_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setSubPage(tab.key)}
            style={{
              position: "relative", padding: "8px 16px", borderRadius: "6px", border: "none",
              backgroundColor: "transparent",
              color: subPage === tab.key ? "#ea580c" : "#666",
              fontWeight: subPage === tab.key ? 600 : 500,
              fontSize: "14px", cursor: "pointer",
              transition: "color 0.15s, background-color 0.15s",
            }}
            onMouseEnter={e => { if (subPage !== tab.key) e.currentTarget.style.backgroundColor = "#fff7ed" }}
            onMouseLeave={e => { if (subPage !== tab.key) e.currentTarget.style.backgroundColor = "transparent" }}
          >
            {tab.label}
            {subPage === tab.key && (
              <span style={{ position: "absolute", bottom: "2px", left: "16px", right: "16px", height: "2px", backgroundColor: "#ea580c", borderRadius: "2px" }} />
            )}
          </button>
        ))}
      </div>

      <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "28px 24px" }}>
        {subPage === "repostajes"   && <VistaRepostajes   vehiculos={vehiculos} />}
        {subPage === "vehiculos"    && <VistaVehiculos />}
        {subPage === "estadisticas" && <VistaEstadisticas vehiculos={vehiculos} />}
      </main>
    </div>
  )
}
