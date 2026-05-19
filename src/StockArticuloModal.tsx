import { useState } from "react"
import { useToast } from "./Toast"
import {
  crearArticulo, actualizarArticulo, crearCategoria,
  type ArticuloStock, type CategoriaStock,
} from "./stockService"

const ACENTO = "#7c3aed"

const UNIDADES_COMUNES = ["ud", "caja", "pack", "rollo", "kg", "litro", "bolsa", "par"]

interface Props {
  articulo: ArticuloStock | null  // null = nuevo
  categorias: CategoriaStock[]
  onClose: () => void
  onSaved: () => void
}

export default function StockArticuloModal({ articulo, categorias: categoriasIniciales, onClose, onSaved }: Props) {
  const toast = useToast()
  const isNuevo = articulo === null

  const [nombre, setNombre] = useState(articulo?.nombre ?? "")
  const [categoriaId, setCategoriaId] = useState<string>(articulo?.categoria_id?.toString() ?? "")
  const [unidad, setUnidad] = useState(
    articulo && !UNIDADES_COMUNES.includes(articulo.unidad) ? "__custom__" : (articulo?.unidad ?? "ud")
  )
  const [unidadCustom, setUnidadCustom] = useState(
    articulo && !UNIDADES_COMUNES.includes(articulo.unidad) ? articulo.unidad : ""
  )
  const [stockInicial, setStockInicial] = useState("")
  const [stockMinimo, setStockMinimo] = useState(articulo?.stock_minimo?.toString() ?? "")

  // ── Estado para nueva categoría inline ──────────────────────────────────────
  const [categorias, setCategorias] = useState<CategoriaStock[]>(categoriasIniciales)
  const [nuevaCategoria, setNuevaCategoria] = useState("")
  const [creandoCategoria, setCreandoCategoria] = useState(false)
  const [savingCategoria, setSavingCategoria] = useState(false)

  const [saving, setSaving] = useState(false)

  const unidadEfectiva = unidad === "__custom__" ? unidadCustom.trim() : unidad
  const valid =
    nombre.trim() !== "" &&
    unidadEfectiva !== "" &&
    (unidad !== "__custom__" || unidadCustom.trim() !== "")

  // ── Crear categoría al vuelo ─────────────────────────────────────────────────

  async function handleCrearCategoria() {
    if (!nuevaCategoria.trim()) return
    setSavingCategoria(true)
    try {
      const id = await crearCategoria(nuevaCategoria.trim())
      const nueva: CategoriaStock = { id, nombre: nuevaCategoria.trim() }
      setCategorias(prev => [...prev, nueva].sort((a, b) => a.nombre.localeCompare(b.nombre)))
      setCategoriaId(String(id))
      setNuevaCategoria("")
      setCreandoCategoria(false)
    } catch (e: any) {
      toast.error("Error al crear categoría", e?.message ?? String(e))
    } finally {
      setSavingCategoria(false)
    }
  }

  // ── Guardar artículo ─────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!valid) return
    setSaving(true)
    try {
      if (isNuevo) {
        await crearArticulo({
          nombre,
          categoria_id: categoriaId !== "" ? Number(categoriaId) : null,
          unidad: unidadEfectiva,
          stock_inicial: stockInicial !== "" ? Number(stockInicial) : 0,
          stock_minimo: stockMinimo !== "" ? Number(stockMinimo) : null,
        })
        toast.success("Artículo creado")
      } else {
        await actualizarArticulo(articulo!.id, {
          nombre,
          categoria_id: categoriaId !== "" ? Number(categoriaId) : null,
          unidad: unidadEfectiva,
          stock_minimo: stockMinimo !== "" ? Number(stockMinimo) : null,
        })
        toast.success("Artículo actualizado")
      }
      onSaved()
      onClose()
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", borderRadius: "7px",
    border: "1px solid #e0e0e0", fontSize: "14px", boxSizing: "border-box", outline: "none",
  }

  const labelStyle: React.CSSProperties = {
    fontSize: "12px", fontWeight: 600, color: "#555", display: "block", marginBottom: "6px",
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.35)", zIndex: 300 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", backgroundColor: "#fff", borderRadius: "14px", width: "460px", maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 64px rgba(0,0,0,0.18)", zIndex: 301, overflow: "hidden" }}>
        <div style={{ height: "4px", backgroundColor: ACENTO }} />
        <div style={{ padding: "24px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 20px" }}>
            {isNuevo ? "Nuevo artículo" : `Editar: ${articulo!.nombre}`}
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {/* Nombre */}
            <div>
              <label style={labelStyle}>Nombre</label>
              <input
                autoFocus value={nombre} onChange={e => setNombre(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
                placeholder="Cinta de embalar, Guantes nitrilo…"
                style={inputStyle}
              />
            </div>

            {/* Categoría */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>
                  Categoría <span style={{ fontWeight: 400, color: "#aaa" }}>(opcional)</span>
                </label>
                {!creandoCategoria && (
                  <button onClick={() => setCreandoCategoria(true)}
                    style={{ fontSize: "11px", color: ACENTO, background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: 0 }}>
                    + Nueva categoría
                  </button>
                )}
              </div>

              {/* Formulario inline nueva categoría */}
              {creandoCategoria ? (
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input
                    autoFocus value={nuevaCategoria} onChange={e => setNuevaCategoria(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") { e.preventDefault(); handleCrearCategoria() }
                      if (e.key === "Escape") { setCreandoCategoria(false); setNuevaCategoria("") }
                    }}
                    placeholder="Nombre de la categoría…"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button onClick={handleCrearCategoria} disabled={savingCategoria || !nuevaCategoria.trim()}
                    style={{ padding: "9px 14px", borderRadius: "7px", border: "none", backgroundColor: nuevaCategoria.trim() ? ACENTO : "#ccc", color: "#fff", fontSize: "13px", fontWeight: 600, cursor: nuevaCategoria.trim() ? "pointer" : "not-allowed", whiteSpace: "nowrap" }}>
                    {savingCategoria ? "…" : "✓ Crear"}
                  </button>
                  <button onClick={() => { setCreandoCategoria(false); setNuevaCategoria("") }}
                    style={{ padding: "9px 10px", borderRadius: "7px", border: "1px solid #e0e0e0", backgroundColor: "#fff", color: "#888", fontSize: "13px", cursor: "pointer" }}>
                    ✕
                  </button>
                </div>
              ) : (
                <select value={categoriaId} onChange={e => setCategoriaId(e.target.value)}
                  style={{ ...inputStyle, cursor: "pointer", color: categoriaId ? "#111" : "#aaa" }}>
                  <option value="">Sin categoría</option>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              )}
            </div>

            {/* Unidad */}
            <div style={{ display: "grid", gridTemplateColumns: unidad === "__custom__" ? "1fr 1fr" : "1fr", gap: "12px" }}>
              <div>
                <label style={labelStyle}>Unidad</label>
                <select value={unidad} onChange={e => setUnidad(e.target.value)}
                  style={{ ...inputStyle, cursor: "pointer" }}>
                  {UNIDADES_COMUNES.map(u => <option key={u} value={u}>{u}</option>)}
                  <option value="__custom__">Otra…</option>
                </select>
              </div>
              {unidad === "__custom__" && (
                <div>
                  <label style={labelStyle}>Escribe la unidad</label>
                  <input
                    value={unidadCustom} onChange={e => setUnidadCustom(e.target.value)}
                    placeholder="metro, bote, bobina…"
                    style={inputStyle}
                  />
                </div>
              )}
            </div>

            {/* Stock inicial (solo al crear) + Stock mínimo */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              {isNuevo && (
                <div>
                  <label style={labelStyle}>
                    Stock inicial <span style={{ fontWeight: 400, color: "#aaa" }}>(opcional)</span>
                  </label>
                  <input
                    type="number" min="0" step="1" value={stockInicial}
                    onChange={e => setStockInicial(e.target.value)}
                    placeholder="0"
                    style={inputStyle}
                  />
                </div>
              )}
              <div>
                <label style={labelStyle}>
                  Stock mínimo <span style={{ fontWeight: 400, color: "#aaa" }}>(alerta)</span>
                </label>
                <input
                  type="number" min="0" step="1" value={stockMinimo}
                  onChange={e => setStockMinimo(e.target.value)}
                  placeholder="Sin alerta"
                  style={inputStyle}
                />
              </div>
            </div>

            {!isNuevo && (
              <div style={{ fontSize: "12px", color: "#aaa", backgroundColor: "#fafafa", padding: "10px 12px", borderRadius: "8px", border: "1px solid #f0f0f0" }}>
                Para ajustar el stock usa los botones "Entrada" y "Salida" en el panel de detalle.
              </div>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
            <button onClick={onClose}
              style={{ padding: "9px 18px", borderRadius: "8px", border: "1px solid #e0e0e0", backgroundColor: "#fff", color: "#555", fontSize: "14px", cursor: "pointer" }}>
              Cancelar
            </button>
            <button onClick={handleSubmit} disabled={saving || !valid}
              style={{ padding: "9px 20px", borderRadius: "8px", border: "none", backgroundColor: valid && !saving ? ACENTO : "#ccc", color: "#fff", fontSize: "14px", fontWeight: 600, cursor: valid && !saving ? "pointer" : "not-allowed" }}>
              {saving ? "Guardando…" : "✓ Guardar"}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
