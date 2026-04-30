import { useState, useEffect, useRef } from "react"
import { useToast } from "./Toast"
import {
  actualizarProducto,
  crearProducto,
  getUnidadesPresentacion,
  crearUnidadPresentacion,
  getPresentacionesDeProducto,
  upsertPresentacion,
  deletePresentacion,
  type CategoriaProducto,
  type ProductoAlmacen,
} from "./productosService"

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface PresentacionDraft {
  id: number          // 0 = nueva (aún sin guardar en BD)
  unidad_id: number
  nombre: string
  precio: string      // string para el input, "" = sin precio
}

// ─── Estilos base ─────────────────────────────────────────────────────────────

const field: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: "6px",
}

const labelStyle: React.CSSProperties = {
  fontSize: "11px", fontWeight: 700, color: "#64748b",
  textTransform: "uppercase", letterSpacing: "0.06em",
}

const inputStyle: React.CSSProperties = {
  height: "38px", padding: "0 12px",
  border: "1.5px solid #e2e8f0", borderRadius: "8px",
  backgroundColor: "#fff", fontSize: "14px", color: "#1f2937",
  outline: "none", width: "100%", boxSizing: "border-box",
}

const selectStyle: React.CSSProperties = {
  ...inputStyle, cursor: "pointer",
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function ModalProducto({
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
  const firstInputRef = useRef<HTMLInputElement>(null)

  // ── Campos básicos ──
  const [referencia, setReferencia] = useState(producto?.referencia ?? "")
  const [nombre, setNombre] = useState(producto?.nombre ?? "")
  const [categoriaId, setCategoriaId] = useState<number>(
    producto?.categoria_id ?? categorias[0]?.id ?? 0
  )

  // ── Presentaciones ──
  const [unidades, setUnidades] = useState<Array<{ id: number; nombre: string }>>([])
  const [presentaciones, setPresentaciones] = useState<PresentacionDraft[]>([])
  const [saving, setSaving] = useState(false)

  // Estado para nueva unidad inline en una presentación
  const [creandoUnidadIdx, setCreandoUnidadIdx] = useState<number | null>(null)
  const [nuevaUnidadNombre, setNuevaUnidadNombre] = useState("")

  // ── Carga inicial ──
  useEffect(() => {
    firstInputRef.current?.focus()
  }, [])

  useEffect(() => {
    getUnidadesPresentacion().then(setUnidades)
  }, [])

  useEffect(() => {
    if (!producto) return
    getPresentacionesDeProducto(producto.id).then(lista => {
      setPresentaciones(lista.map(p => ({
        id: p.id,
        unidad_id: p.unidad_id,
        nombre: p.nombre,
        precio: p.precio !== null ? String(p.precio) : "",
      })))
    })
  }, [producto])

  // ── Helpers ──

  function addPresentacion() {
    const primera = unidades.find(
      u => !presentaciones.some(p => p.unidad_id === u.id)
    )
    if (!primera) return
    setPresentaciones(prev => [...prev, {
      id: 0, unidad_id: primera.id, nombre: primera.nombre, precio: "",
    }])
  }

  async function crearNuevaUnidad(idx: number) {
    if (!nuevaUnidadNombre.trim()) {
      setCreandoUnidadIdx(null)
      setNuevaUnidadNombre("")
      return
    }
    try {
      const newId = await crearUnidadPresentacion(nuevaUnidadNombre.trim())
      const nueva = { id: newId, nombre: nuevaUnidadNombre.trim() }
      setUnidades(prev => [...prev, nueva])
      setPresentaciones(prev => prev.map((p, i) =>
        i === idx ? { ...p, unidad_id: newId, nombre: nueva.nombre } : p
      ))
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    } finally {
      setCreandoUnidadIdx(null)
      setNuevaUnidadNombre("")
    }
  }

  async function eliminarPresentacion(idx: number) {
    const pres = presentaciones[idx]
    if (pres.id === 0) {
      setPresentaciones(prev => prev.filter((_, i) => i !== idx))
      return
    }
    try {
      await deletePresentacion(pres.id)
      setPresentaciones(prev => prev.filter((_, i) => i !== idx))
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    }
  }

  // ── Submit ──

  async function handleSubmit() {
    if (!referencia.trim() || !nombre.trim()) {
      toast.error("Error", "Referencia y nombre son obligatorios")
      return
    }

    for (const p of presentaciones) {
      if (p.precio.trim() !== "" && isNaN(parseFloat(p.precio.replace(",", ".")))) {
        toast.error("Error", `Precio inválido en "${p.nombre}"`)
        return
      }
    }

    setSaving(true)
    try {
      const precioRef = (() => {
        const p = presentaciones[0]
        if (!p || p.precio.trim() === "") return null
        return parseFloat(p.precio.replace(",", "."))
      })()

      let productoId: number

      if (producto) {
        await actualizarProducto(producto.id, {
          referencia: referencia.trim(),
          nombre: nombre.trim(),
          categoria_id: categoriaId,
          unidad_medida: presentaciones[0]?.nombre ?? producto.unidad_medida,
          precio: precioRef,
        })
        productoId = producto.id
        toast.success("Producto actualizado")
      } else {
        productoId = await crearProducto(
          referencia.trim(), nombre.trim(), categoriaId,
          presentaciones[0]?.nombre ?? "UNIDAD",
          precioRef,
        )
        toast.success("Producto creado")
      }

      // Sincronizar presentaciones
      const existentes = await getPresentacionesDeProducto(productoId)

      for (const pres of presentaciones) {
        const precio = pres.precio.trim() !== ""
          ? parseFloat(pres.precio.replace(",", "."))
          : null
        await upsertPresentacion(productoId, pres.unidad_id, precio)
      }

      // Eliminar las que se quitaron del formulario
      const unidadesEnForm = new Set(presentaciones.map(p => p.unidad_id))
      for (const ex of existentes) {
        if (!unidadesEnForm.has(ex.unidad_id)) {
          try { await deletePresentacion(ex.id) } catch { /* tiene salidas, se deja */ }
        }
      }

      onSaved()
      onClose()
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    } finally {
      setSaving(false)
    }
  }

  // ── Unidades disponibles para una fila (excluye las ya usadas en otras filas) ──
  function unidadesDisponibles(excluirIdx: number) {
    const usadas = new Set(
      presentaciones.filter((_, i) => i !== excluirIdx).map(p => p.unidad_id)
    )
    return unidades.filter(u => !usadas.has(u.id))
  }

  const hayUnidadesLibres = unidades.some(
    u => !presentaciones.some(p => p.unidad_id === u.id)
  )

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", zIndex: 400 }}
      />

      {/* Modal */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: "fixed", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          backgroundColor: "#fff", borderRadius: "16px",
          width: "500px", maxWidth: "calc(100vw - 32px)",
          maxHeight: "90vh", display: "flex", flexDirection: "column",
          boxShadow: "0 24px 64px rgba(0,0,0,0.18)", zIndex: 401, overflow: "hidden",
        }}
      >
        {/* Franja verde */}
        <div style={{ height: "4px", backgroundColor: "#16a34a", flexShrink: 0 }} />

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 24px 0", flexShrink: 0,
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#111827" }}>
              {producto ? "Editar producto" : "Nuevo producto"}
            </h2>
            {producto && (
              <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#94a3b8" }}>
                {producto.referencia}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              width: "28px", height: "28px", border: "none",
              backgroundColor: "#f1f5f9", borderRadius: "6px",
              cursor: "pointer", color: "#64748b", fontSize: "14px",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >✕</button>
        </div>

        {/* Cuerpo scrollable */}
        <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "16px" }}>

          {/* ── Sección: identificación ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em" }}>
              Identificación
            </div>

            <div style={{ display: "flex", gap: "12px" }}>
              <div style={{ ...field, flex: "0 0 130px" }}>
                <label style={labelStyle}>Referencia</label>
                <input
                  ref={firstInputRef}
                  type="text"
                  value={referencia}
                  onChange={e => setReferencia(e.target.value)}
                  placeholder="BOLSA-001"
                  style={inputStyle}
                />
              </div>
              <div style={{ ...field, flex: 1 }}>
                <label style={labelStyle}>Nombre / Descripción</label>
                <input
                  type="text"
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  placeholder="Bolsa de basura 50L"
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={field}>
              <label style={labelStyle}>Categoría</label>
              <select
                value={categoriaId}
                onChange={e => setCategoriaId(Number(e.target.value))}
                style={selectStyle}
              >
                {categorias.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Divider ── */}
          <div style={{ height: "1px", backgroundColor: "#f1f5f9" }} />

          {/* ── Sección: presentaciones ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                Presentaciones
              </div>
              <span style={{ fontSize: "11px", color: "#cbd5e1" }}>
                Unidad · Precio por unidad
              </span>
            </div>

            {presentaciones.length === 0 && (
              <div style={{
                padding: "16px", borderRadius: "10px", border: "1.5px dashed #e2e8f0",
                textAlign: "center", color: "#94a3b8", fontSize: "13px",
              }}>
                Sin presentaciones — añade al menos una para registrar consumos
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {presentaciones.map((pres, idx) => {
                const disponibles = unidadesDisponibles(idx)
                return (
                  <div
                    key={idx}
                    style={{
                      display: "flex", alignItems: "flex-end", gap: "8px",
                      padding: "12px", borderRadius: "10px",
                      backgroundColor: "#f8fafc", border: "1px solid #e2e8f0",
                    }}
                  >
                    {/* Selector unidad */}
                    <div style={{ ...field, flex: 1 }}>
                      <label style={labelStyle}>Unidad</label>
                      {creandoUnidadIdx === idx ? (
                        <div style={{ display: "flex", gap: "6px" }}>
                          <input
                            autoFocus
                            type="text"
                            value={nuevaUnidadNombre}
                            onChange={e => setNuevaUnidadNombre(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") crearNuevaUnidad(idx)
                              if (e.key === "Escape") { setCreandoUnidadIdx(null); setNuevaUnidadNombre("") }
                            }}
                            placeholder="Ej: Garrafa 5L"
                            style={{ ...inputStyle, flex: 1 }}
                          />
                          <button
                            onClick={() => crearNuevaUnidad(idx)}
                            style={{ height: "38px", padding: "0 12px", border: "none", borderRadius: "8px", backgroundColor: "#6366f1", color: "#fff", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                          >OK</button>
                          <button
                            onClick={() => { setCreandoUnidadIdx(null); setNuevaUnidadNombre("") }}
                            style={{ height: "38px", padding: "0 10px", border: "1.5px solid #e2e8f0", borderRadius: "8px", backgroundColor: "#fff", color: "#64748b", fontSize: "12px", cursor: "pointer" }}
                          >✕</button>
                        </div>
                      ) : (
                        <select
                          value={pres.unidad_id}
                          onChange={e => {
                            const val = Number(e.target.value)
                            if (val === -1) {
                              setCreandoUnidadIdx(idx)
                              return
                            }
                            setPresentaciones(prev => prev.map((p, i) => i === idx ? {
                              ...p,
                              unidad_id: val,
                              nombre: unidades.find(u => u.id === val)?.nombre ?? "",
                            } : p))
                          }}
                          style={selectStyle}
                        >
                          {disponibles.map(u => (
                            <option key={u.id} value={u.id}>{u.nombre}</option>
                          ))}
                          <option disabled style={{ color: "#d1d5db" }}>──────────</option>
                          <option value={-1}>+ Crear nueva unidad…</option>
                        </select>
                      )}
                    </div>

                    {/* Precio */}
                    <div style={{ ...field, flex: "0 0 110px" }}>
                      <label style={labelStyle}>Precio (€)</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={pres.precio}
                        onChange={e => setPresentaciones(prev => prev.map((p, i) =>
                          i === idx ? { ...p, precio: e.target.value } : p
                        ))}
                        placeholder="—"
                        style={inputStyle}
                      />
                    </div>

                    {/* Eliminar */}
                    <button
                      onClick={() => eliminarPresentacion(idx)}
                      title="Quitar presentación"
                      style={{
                        flexShrink: 0, width: "38px", height: "38px",
                        border: "1.5px solid #fca5a5", borderRadius: "8px",
                        backgroundColor: "#fff", color: "#dc2626",
                        fontSize: "14px", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#fef2f2" }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#fff" }}
                    >✕</button>
                  </div>
                )
              })}
            </div>

            {/* Botón añadir presentación */}
            {unidades.length === 0 ? (
              <p style={{ fontSize: "12px", color: "#f97316", margin: 0 }}>
                No hay unidades disponibles — créalas desde <strong>Gestionar → Unidades</strong>
              </p>
            ) : hayUnidadesLibres ? (
              <button
                onClick={addPresentacion}
                style={{
                  height: "36px", border: "1.5px dashed #c7d2fe", borderRadius: "8px",
                  backgroundColor: "#fff", color: "#6366f1",
                  fontSize: "13px", fontWeight: 600, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#eef2ff" }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#fff" }}
              >
                <span style={{ fontSize: "16px", lineHeight: 1 }}>+</span> Añadir presentación
              </button>
            ) : (
              <p style={{ fontSize: "12px", color: "#94a3b8", textAlign: "center", margin: 0 }}>
                Todas las unidades están asignadas
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: "16px 24px", borderTop: "1px solid #f1f5f9",
          display: "flex", gap: "8px", justifyContent: "flex-end", flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            style={{
              height: "38px", padding: "0 18px", border: "1.5px solid #e2e8f0",
              borderRadius: "8px", backgroundColor: "#fff", color: "#64748b",
              fontSize: "13px", fontWeight: 600, cursor: "pointer",
            }}
          >Cancelar</button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{
              height: "38px", padding: "0 22px", border: "none",
              borderRadius: "8px",
              backgroundColor: saving ? "#d1fae5" : "#16a34a",
              color: saving ? "#6ee7b7" : "#fff",
              fontSize: "13px", fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Guardando…" : producto ? "Guardar cambios" : "Crear producto"}
          </button>
        </div>
      </div>
    </>
  )
}
