import { useState } from "react"
import { getDB } from "./db"
import { useConfirm } from "./ConfirmDialog"
import ColorSelect from "./ColorSelect"
import DepartmentSelect from "./DepartmentSelect"
import AppHeader from "./AppHeader"
import { Field, fieldInputStyle } from "./FormField"

export default function ProductForm({ onClose, onSaved, onNavigate }: any) {
  const [nombre, setNombre] = useState("")
  const [codigo, setCodigo] = useState("")
  const [tallas, setTallas] = useState<string[]>([])
  const [nuevaTalla, setNuevaTalla] = useState("")
  const [color, setColor] = useState("")
  const [departamento, setDepartamento] = useState<number | null>(null)
  const [precio, setPrecio] = useState<number | null>(null)
  const { alert, dialog } = useConfirm()

  async function save() {
    if (!nombre) {
      await alert("Introduce un nombre para la prenda")
      return
    }
    const db = await getDB()
    await db.execute(
      "INSERT INTO productos (codigo,nombre,departamento_id,color,precio) VALUES (?,?,?,?,?)",
      [codigo || null, nombre, departamento, color || null, precio ?? null]
    )
    const row: any = await db.select("SELECT last_insert_rowid() as id")
    const productId = row[0].id
    for (const talla of tallas) {
      await db.execute(
        "INSERT INTO tallas (producto_id,talla,stock) VALUES (?,?,0)",
        [productId, talla]
      )
    }
    onSaved()
    await alert(`"${nombre}" añadida al inventario`, { confirmLabel: "Aceptar" })
    onClose()
  }

  function addTallas() {
    if (!nuevaTalla) return
    const nuevas = nuevaTalla.split(",").map((t: string) => t.trim()).filter((t: string) => t.length > 0)
    setTallas([...new Set([...tallas, ...nuevas])])
    setNuevaTalla("")
  }

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f5f5f5", fontFamily: "system-ui, sans-serif" }}>

      <AppHeader
        page="inventory"
        onNavigate={onNavigate}
        onBack={onClose}
        title="Nueva prenda"
      />

      <main style={{ maxWidth: "560px", margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ backgroundColor: "#fff", border: "1px solid #e0e0e0", borderRadius: "10px", padding: "28px" }}>

          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>

            <Field
              label="Nombre de la prenda *"
              editing
              value={nombre}
              onChange={setNombre}
              placeholder="Ej: Camiseta básica"
              autoFocus
            />

            <Field
              label="Código (opcional)"
              editing
              value={codigo}
              onChange={setCodigo}
              placeholder="Ej: CAM-001"
            />

            <Field
              label="Precio (opcional)"
              editing
              value={precio !== null ? String(precio) : ""}
              onChange={(v: string) => setPrecio(v === "" ? null : Number(v))}
              placeholder="Ej: 19.99"
            />

            <Field label="Color" editing>
              <ColorSelect value={color} onChange={setColor} />
            </Field>

            <Field label="Departamento" editing>
              <DepartmentSelect value={departamento} onChange={setDepartamento} />
            </Field>

            {/* Tallas — mantiene su lógica custom, no es un Field simple */}
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#555", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Tallas
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  placeholder="Ej: S, M, L o 36, 38, 40"
                  value={nuevaTalla}
                  onChange={e => setNuevaTalla(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addTallas() }}
                  style={{ ...fieldInputStyle, flex: 1 }}
                />
                <button
                  onClick={addTallas}
                  style={{ padding: "10px 16px", backgroundColor: "#2563eb", color: "#fff", border: "none", borderRadius: "6px", fontSize: "14px", cursor: "pointer", fontWeight: 500, whiteSpace: "nowrap" }}
                >
                  Añadir
                </button>
              </div>
              <div style={{ fontSize: "12px", color: "#aaa", marginTop: "5px" }}>
                Separa varias tallas con comas: S, M, L, XL
              </div>
              {tallas.length > 0 && (
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "10px" }}>
                  {tallas.map((t, i) => (
                    <span
                      key={i}
                      onClick={() => setTallas(tallas.filter((_, idx) => idx !== i))}
                      title="Clic para eliminar"
                      style={{ backgroundColor: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", padding: "4px 12px", borderRadius: "20px", fontSize: "13px", fontWeight: 500, display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}
                    >
                      {t} ✕
                    </span>
                  ))}
                </div>
              )}
            </div>

          </div>

          <div style={{ display: "flex", gap: "12px", marginTop: "28px", borderTop: "1px solid #f0f0f0", paddingTop: "24px" }}>
            <button
              onClick={save}
              style={{ padding: "10px 24px", backgroundColor: "#16a34a", color: "#fff", border: "none", borderRadius: "7px", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}
            >
              ✓ Guardar prenda
            </button>
            <button
              onClick={onClose}
              style={{ padding: "10px 20px", backgroundColor: "#fff", color: "#555", border: "1px solid #ddd", borderRadius: "7px", fontSize: "14px", cursor: "pointer" }}
            >
              Cancelar
            </button>
          </div>

        </div>
      </main>
      {dialog}
    </div>
  )
}
