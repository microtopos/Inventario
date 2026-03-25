import { useState, useEffect } from "react"
import { useToast } from "./Toast"
import { useConfirm } from "./ConfirmDialog"
import * as XLSX from "xlsx"
import {
  getCategorias,
  getDepartamentosProd,
  ensureProduct,
  upsertSalida,
  crearCategoria,
  type CategoriaProducto,
  type DepartamentoProd,
} from "./productosService"

interface ImportarProductosModalProps {
  onClose: () => void
  onImported: () => void
  departamentos: DepartamentoProd[]
}

// Mapa de nombres de mes a número
const monthMap: { [key: string]: number } = {
  'ENE': 1, 'ENERO': 1,
  'FEB': 2, 'FEBRERO': 2,
  'MAR': 3, 'MARZO': 3,
  'ABR': 4, 'ABRIL': 4,
  'MAY': 5, 'MAYO': 5,
  'JUN': 6, 'JUNIO': 6,
  'JUL': 7, 'JULIO': 7,
  'AGO': 8, 'AGOSTO': 8,
  'SET': 9, 'SEP': 9, 'SEPTIEMBRE': 9,
  'OCT': 10, 'OCTUBRE': 10,
  'NOV': 11, 'NOVIEMBRE': 11,
  'DIC': 12, 'DICIEMBRE': 12,
}

// constantes de estilos
const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: "8px",
  border: "1px solid #d1d5db",
  backgroundColor: "#fff",
  fontSize: "14px",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
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

export default function ImportarProductosModal({ onClose, onImported, departamentos }: ImportarProductosModalProps) {
  const toast = useToast()
  const { confirm } = useConfirm()

  const [departamentoId, setDepartamentoId] = useState<number>(0)
  const [year, setYear] = useState(new Date().getFullYear())
  const [previewData, setPreviewData] = useState<any[] | null>(null)
  const [categoriasDetectadas, setCategoriasDetectadas] = useState<string[]>([])
  const [processing, setProcessing] = useState(false)
  const [step, setStep] = useState<"upload" | "preview" | "done">("upload")

  // Cargar archivo
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null
    if (!file) return

    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: "array" })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

      // Detectar encabezado con meses
      const monthNames = Object.keys(monthMap)
      let headerRowIndex = -1
      for (let i = 0; i < Math.min(10, data.length); i++) {
        const rowStr = row.map(c => String(c || '')).join(' ').toUpperCase()
        if (monthNames.some(m => rowStr.includes(m))) {
          headerRowIndex = i
          break
        }
      }
      if (headerRowIndex === -1) {
        throw new Error("No se encontró encabezado con meses en el archivo")
      }

      const headerRow = data[headerRowIndex]
      const detectedMonths: { idx: number; month: number }[] = []

      headerRow.forEach((col: any, idx: number) => {
        const colStr = String(col || '').toUpperCase().trim()
        for (const [name, monthNum] of Object.entries(monthMap)) {
          if (colStr.includes(name)) {
            detectedMonths.push({ idx, month: monthNum })
            break
          }
        }
      })

      if (detectedMonths.length === 0) {
        throw new Error("No se detectaron columnas de meses")
      }

      // Parsear productos
      const categoriesSeen: string[] = []
      const productos: any[] = []
      let currentCategory = "SIN CATEGORÍA"

      for (let i = headerRowIndex + 1; i < data.length; i++) {
        const row = data[i]
        if (!row || row.length === 0) continue

        const ref = row[0]
        const desc = row[1]

        const refStr = (ref ?? '').toString().trim()
        const descStr = (desc ?? '').toString().trim()

        // Fila de categoría: referencia no vacía y descripción vacía
        if (refStr !== '' && descStr === '') {
          currentCategory = refStr
          if (!categoriesSeen.includes(currentCategory)) {
            categoriesSeen.push(currentCategory)
          }
          continue
        }

        if (refStr === '') continue

        // Fila de producto
        const prod = {
          referencia: refStr,
          nombre: descStr,
          categoria_nombre: currentCategory,
          unidad_medida: "UNIDAD", // por defecto
          meses: {} as { [key: number]: number },
        }

        for (const { idx, month } of detectedMonths) {
          const val = row[idx]
          if (val !== undefined && val !== null) {
            const str = String(val).trim()
            if (str) {
              const num = parseInt(str.split(' ')[0], 10)
              if (!isNaN(num) && num > 0) {
                prod.meses[month] = num
              }
            }
          }
        }

        productos.push(prod)
      }

      setPreviewData(productos)
      setCategoriasDetectadas(categoriesSeen)
      setStep("preview")
    } catch (err: any) {
      toast.error("Error leyendo archivo", err.message || String(err))
    }
  }

  // Obtener o crear categoría por nombre
  const getOrCreateCategoriaId = async (nombre: string): Promise<number> => {
    const cats = await getCategorias()
    const existente = cats.find(c => c.nombre.toUpperCase() === nombre.toUpperCase())
    if (existente) return existente.id
    return await crearCategoria(nombre)
  }

  const handleImport = async () => {
    if (!departamentoId) {
      toast.error("Error", "Selecciona un departamento")
      return
    }
    if (!previewData || previewData.length === 0) {
      toast.error("Error", "No hay datos para importar")
      return
    }

    const confirmMsg = `Se importarán ${previewData.length} productos para el departamento seleccionado y año ${year}. ¿Continuar?`
    if (!(await confirm(confirmMsg, { confirmLabel: "Importar" }))) return

    setProcessing(true)
    try {
      // Procesar en lotes para reducir bloqueos
      const batchSize = 10
      for (let i = 0; i < previewData.length; i++) {
        const prod = previewData[i]

        try {
          const catId = await getOrCreateCategoriaId(prod.categoria_nombre || "SIN CATEGORÍA")

          const productoId = await ensureProduct(
            prod.referencia,
            prod.nombre,
            catId,
            prod.unidad_medida || "UNIDAD"
          )

          for (const [mes, cantidad] of Object.entries(prod.meses)) {
            await upsertSalida({
              producto_id: productoId,
              departamento_id: departamentoId,
              cantidad,
              mes: Number(mes),
              anio: year,
            })
          }
        } catch (err: any) {
          console.error(`Error importando producto ${prod.referencia}:`, err)
          // Continuar con el siguiente producto
        }

        // Pausa cada batch para reducir presión en la DB
        if ((i + 1) % batchSize === 0 && i < previewData.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 150))
        }
      }

      toast.success("Importación completada")
      setStep("done")
      setTimeout(onImported, 500)
    } catch (err: any) {
      toast.error("Error", err.message || String(err))
    } finally {
      setProcessing(false)
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.35)", zIndex: 400 }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        backgroundColor: "#fff", borderRadius: "14px", width: "560px",
        maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
        zIndex: 401, overflow: "hidden",
      }}>
        <div style={{ height: "4px", backgroundColor: "#2563eb" }} />
        <div style={{ padding: "24px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 20px" }}>
            Importar productos desde Excel
          </h2>

          {step === "upload" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", display: "block", marginBottom: "6px" }}>
                  Archivo Excel/CSV
                </label>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileChange}
                  style={{ ...inputStyle, height: "40px" }}
                />
              </div>
              <div style={{ fontSize: "12px", color: "#666", lineHeight: 1.6 }}>
                El archivo debe contener columnas de meses (Ene, Feb, Mar, etc.). Las filas se agrupan por categorías cuando la descripción está vacía. Se importarán las cantidades numéricas encontradas en las celdas.
              </div>
            </div>
          )}

          {step === "preview" && previewData && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", display: "block", marginBottom: "6px" }}>
                    Departamento
                  </label>
                  <select
                    value={departamentoId}
                    onChange={e => setDepartamentoId(Number(e.target.value))}
                    style={{ ...inputStyle }}
                  >
                    <option value="">Selecciona un departamento</option>
                    {departamentos.map(dep => (
                      <option key={dep.id} value={dep.id}>{dep.nombre}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", display: "block", marginBottom: "6px" }}>
                    Año
                  </label>
                  <input
                    type="number"
                    value={year}
                    onChange={e => setYear(Number(e.target.value))}
                    style={{ ...inputStyle, width: "100px" }}
                  />
                </div>
              </div>

              <div>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "#555", marginBottom: "8px" }}>
                  Categorías detectadas: <span style={{ fontWeight: 400 }}>{categoriasDetectadas.join(", ")}</span>
                </div>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "#555", marginBottom: "8px" }}>
                  Productos a importar: <span style={{ fontWeight: 400 }}>{previewData.length}</span>
                </div>
                <div style={{ maxHeight: "250px", overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                    <thead style={{ backgroundColor: "#f9fafb", position: "sticky", top: 0 }}>
                      <tr>
                        <th style={{ padding: "8px", textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>Ref</th>
                        <th style={{ padding: "8px", textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>Nombre</th>
                        <th style={{ padding: "8px", textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>Categoría</th>
                        <th style={{ padding: "8px", textAlign: "center", borderBottom: "1px solid #e5e7eb" }}>Mensual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.slice(0, 50).map((p, i) => (
                        <tr key={i} style={{ backgroundColor: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                          <td style={{ padding: "6px 8px", fontWeight: 500 }}>{p.referencia}</td>
                          <td style={{ padding: "6px 8px" }}>{p.nombre}</td>
                          <td style={{ padding: "6px 8px", fontSize: "11px", color: "#666" }}>{p.categoria_nombre}</td>
                          <td style={{ padding: "6px 8px", textAlign: "center", fontSize: "11px" }}>
                            {Object.entries(p.meses).map(([mes, cant]) => (
                              <div key={mes}>{mes}: {cant}</div>
                            ))}
                          </td>
                        </tr>
                      ))}
                      {previewData.length > 50 && (
                        <tr>
                          <td colSpan={4} style={{ padding: "8px", textAlign: "center", color: "#666" }}>
                            ... y {previewData.length - 50} más
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button
                  onClick={() => setStep("upload")}
                  style={{ ...btnStyle, border: "1px solid #ddd" }}
                >
                  ← Volver
                </button>
                <button
                  onClick={handleImport}
                  disabled={!departamentoId || processing}
                  style={{ ...btnStyle, backgroundColor: (!departamentoId || processing) ? "#ccc" : "#16a34a", color: "#fff", border: "none" }}
                >
                  {processing ? "Importando..." : "✓ Importar"}
                </button>
              </div>
            </div>
          )}

          {step === "done" && (
            <div style={{ textAlign: "center", padding: "20px", color: "#16a34a" }}>
              <div style={{ fontSize: "32px", marginBottom: "12px" }}>✓</div>
              <div style={{ fontSize: "16px", fontWeight: 600 }}>Importación completada</div>
              <div style={{ fontSize: "13px", color: "#666", marginTop: "6px" }}>{previewData?.length} productos registrados</div>
              <button
                onClick={onClose}
                style={{ marginTop: "20px", padding: "10px 24px", border: "none", borderRadius: "6px", backgroundColor: "#16a34a", color: "#fff", cursor: "pointer", fontSize: "14px", fontWeight: 600 }}
              >
                Cerrar
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
