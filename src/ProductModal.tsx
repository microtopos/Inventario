import { useState, useEffect } from "react"
import { useToast } from "./Toast"
import { useConfirm } from "./ConfirmDialog"
import {
  getCategorias,
  actualizarProducto,
  crearProducto,
  type CategoriaProducto,
  type ProductoAlmacen,
} from "./productosService"

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
  const [referencia, setReferencia] = useState(producto?.referencia ?? "")
  const [nombre, setNombre] = useState(producto?.nombre ?? "")
  const [categoriaId, setCategoriaId] = useState<number>(producto?.categoria_id ?? categorias[0]?.id ?? 0)
  const [unidadMedida, setUnidadMedida] = useState(producto?.unidad_medida ?? "")
  const [precio, setPrecio] = useState<string>(producto?.precio?.toString() ?? "")
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
    const precioNum = precio.trim() ? parseFloat(precio) : null
    if (precio.trim() && isNaN(precioNum)) {
      toast.error("Error", "El precio debe ser un número válido")
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
          precio: precioNum,
        })
        toast.success("Producto actualizado")
      } else {
        await crearProducto(referencia.trim(), nombre.trim(), categoriaId, unidadMedida.trim(), precioNum)
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
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", display: "block", marginBottom: "6px" }}>
                Precio (€) <span style={{ fontWeight: 400, color: "#999" }}>(opcional)</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={precio}
                onChange={e => setPrecio(e.target.value)}
                style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                placeholder="Ej: 4.99"
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
