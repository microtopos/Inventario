import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { useConfirm } from "./ConfirmDialog"
import { useToast } from "./Toast"
import * as XLSX from "xlsx"
import {
  getCategorias,
  getProductos,
  getDepartamentosProd,
  actualizarProducto,
  crearProducto,
  deleteProduct,
  upsertSalida,
  crearDepartamentoProd,
  crearCategoria,
  ensureProduct,
  type CategoriaProducto,
  type ProductoAlmacen,
  type DepartamentoProd,
  getSalidasByYear,
} from "./productosService"
import { ModalProducto } from "./ProductModal"

async function getOrCreateCategoriaId(nombre: string): Promise<number> {
  const cats = await getCategorias();
  const existente = cats.find(c => c.nombre.toUpperCase() === nombre.toUpperCase());
  if (existente) return existente.id;
  return await crearCategoria(nombre);
}

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
]

// Componente principal
export default function VistaCatalogoMejorada({ onDepartamentoCreado }: { onDepartamentoCreado?: () => void }) {
  const toast = useToast()
  const { confirm } = useConfirm()

  // Estados
  const [categorias, setCategorias] = useState<CategoriaProducto[]>([])
  const [productos, setProductos] = useState<ProductoAlmacen[]>([])
  const [departamentos, setDepartamentos] = useState<DepartamentoProd[]>([])
  const [departamentoId, setDepartamentoId] = useState<number | "">("")
  const [year, setYear] = useState(new Date().getFullYear())
  const [searchTerm, setSearchTerm] = useState("")
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set())
  const [editingProductId, setEditingProductId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingCell, setSavingCell] = useState<{ productoId: number; mes: number } | null>(null)
  const [showNewDeptInput, setShowNewDeptInput] = useState(false)
  const [newDeptName, setNewDeptName] = useState("")
  const [isImporting, setIsImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Mapa de salidas: producto_id -> mes -> cantidad
  const [salidasMap, setSalidasMap] = useState<Map<number, Map<number, number>>>(new Map())

  // Carga inicial
  useEffect(() => {
    loadInitialData()
  }, [])

  // Cada vez que cambia departamento o año, recargar salidas
  useEffect(() => {
    if (departamentoId !== "" && year) {
      loadSalidas()
    }
  }, [departamentoId, year])

  // Recargar lista de departamentos desde BD
  const handleDepartamentoCreado = async () => {
    try {
      const depts = await getDepartamentosProd()
      setDepartamentos(depts)
      // Notificar al padre si existe callback
      if (onDepartamentoCreado) {
        onDepartamentoCreado()
      }
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    }
  }

  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (departamentoId === "" || departamentoId <= 0) {
      toast.error("Error", "Selecciona un departamento válido antes de importar");
      return;
    }

    setIsImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

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
      };
      const monthNames = Object.keys(monthMap);
      let headerRowIndex = -1;
      for (let i = 0; i < Math.min(10, data.length); i++) {
        const currentRow = data[i] || [];
        const rowStr = currentRow.map(c => String(c || '')).join(' ').toUpperCase();
        if (monthNames.some(m => rowStr.includes(m))) {
          headerRowIndex = i;
          break;
        }
      }
      if (headerRowIndex === -1) {
        throw new Error("No se encontró encabezado con meses en el archivo");
      }

      const headerRow = data[headerRowIndex];
      const detectedMonths: { idx: number; month: number }[] = [];
      headerRow.forEach((col: any, idx: number) => {
        const colStr = String(col || '').toUpperCase().trim();
        for (const [name, monthNum] of Object.entries(monthMap)) {
          if (colStr.includes(name)) {
            detectedMonths.push({ idx, month: monthNum });
            break;
          }
        }
      });
      if (detectedMonths.length === 0) {
        throw new Error("No se detectaron columnas de meses");
      }

      const categoriesSeen: string[] = [];
      const productos: any[] = [];
      let currentCategory = "SIN CATEGORÍA";

      for (let i = headerRowIndex + 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;

        const ref = row[0];
        const desc = row[1];
        const refStr = (ref ?? '').toString().trim();
        const descStr = (desc ?? '').toString().trim();

        if (refStr !== '' && descStr === '') {
          currentCategory = refStr;
          if (!categoriesSeen.includes(currentCategory)) {
            categoriesSeen.push(currentCategory);
          }
          continue;
        }

        if (refStr === '') continue;

        const prod = {
          referencia: refStr,
          nombre: descStr,
          categoria_nombre: currentCategory,
          unidad_medida: "UNIDAD",
          meses: {} as { [key: number]: number },
        };

        for (const { idx, month } of detectedMonths) {
          const val = row[idx];
          if (val !== undefined && val !== null) {
            const str = String(val).trim();
            if (str) {
              const num = parseInt(str.split(' ')[0], 10);
              if (!isNaN(num) && num > 0) {
                prod.meses[month] = num;
              }
            }
          }
        }
        productos.push(prod);
      }

      if (productos.length === 0) {
        throw new Error("No se encontraron productos para importar");
      }

      const batchSize = 10;
      let importedCount = 0;
      for (let i = 0; i < productos.length; i++) {
        const prod = productos[i];
        try {
          const catId = await getOrCreateCategoriaId(prod.categoria_nombre || "SIN CATEGORÍA");
          const productoId = await ensureProduct(
            prod.referencia,
            prod.nombre,
            catId,
            prod.unidad_medida || "UNIDAD"
          );
          for (const [mes, cantidad] of Object.entries(prod.meses)) {
            await upsertSalida({
              producto_id: productoId,
              departamento_id: departamentoId as number,
              cantidad,
              mes: Number(mes),
              anio: year,
            });
          }
          importedCount++;
        } catch (err) {
          console.error(`Error importando producto ${prod.referencia}:`, err);
        }

        if ((i + 1) % batchSize === 0 && i < productos.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 150));
        }
      }

      toast.success("Importación completada", `Se importaron ${importedCount} productos`);
      await loadInitialData();
      await loadSalidas();
    } catch (err: any) {
      toast.error("Error importando archivo", err.message || String(err));
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  async function loadInitialData() {
    setLoading(true)
    try {
      const [cats, prods, depts] = await Promise.all([
        getCategorias(),
        getProductos(false), // todos, incluyendo inactivos para verlos
        getDepartamentosProd(),
      ])
      setCategorias(cats)
      setProductos(prods)
      setDepartamentos(depts)
      // Expandir todas las categorías por defecto
      setExpandedCategories(new Set(cats.map(c => c.id)))
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  async function loadSalidas() {
    if (departamentoId === "") return
    try {
      const mapa = await getSalidasByYear(year, Number(departamentoId))
      setSalidasMap(mapa)
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    }
  }

  // Productos filtrados por búsqueda y departamento (departamento no filtra productos, solo las salidas)
  const productosFiltrados = useMemo(() => {
    if (!searchTerm.trim()) return productos
    const term = searchTerm.toLowerCase()
    return productos.filter(p =>
      p.referencia.toLowerCase().includes(term) ||
      p.nombre.toLowerCase().includes(term)
    )
  }, [productos, searchTerm])

  // Agrupación por categoría
  const productosPorCategoria = useMemo(() => {
    const mapa = new Map<number, ProductoAlmacen[]>()
    for (const prod of productosFiltrados) {
      if (!mapa.has(prod.categoria_id)) {
        mapa.set(prod.categoria_id, [])
      }
      mapa.get(prod.categoria_id)!.push(prod)
    }
    return mapa
  }, [productosFiltrados])

  // Toggle categoría
  const toggleCategory = (catId: number) => {
    const nuevo = new Set(expandedCategories)
    if (nuevo.has(catId)) {
      nuevo.delete(catId)
    } else {
      nuevo.add(catId)
    }
    setExpandedCategories(nuevo)
  }

  // Obtener consumo para un producto y mes
  function getConsumo(productoId: number, mes: number): number {
    const prodMap = salidasMap.get(productoId)
    return prodMap?.get(mes) ?? 0
  }

  // Actualizar consumo de una celda
  const handleCellChange = useCallback(async (productoId: number, mes: number, valorStr: string) => {
    if (departamentoId === "") return
    const valor = Number(valorStr)
    if (isNaN(valor) || valor < 0) return

    setSavingCell({ productoId, mes })

    try {
      await upsertSalida({
        producto_id: productoId,
        departamento_id: Number(departamentoId),
        cantidad: valor,
        mes,
        anio: year,
      })
      // Actualizar mapa local
      setSalidasMap(prev => {
        const nuevo = new Map(prev)
        if (!nuevo.has(productoId)) {
          nuevo.set(productoId, new Map())
        }
        const prodMap = nuevo.get(productoId)!
        if (valor === 0) {
          prodMap.delete(mes)
        } else {
          prodMap.set(mes, valor)
        }
        return nuevo
      })
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    } finally {
      setSavingCell(null)
    }
  }, [departamentoId, year, toast])

  async function handleDeleteProduct(producto: ProductoAlmacen) {
    const ok = await confirm(
      `¿Eliminar el producto "${producto.referencia}"?`,
      { confirmLabel: "Eliminar", danger: true, detail: "Se borrarán también todos los registros de salida asociados." }
    )
    if (!ok) return
    try {
      await deleteProduct(producto.id)
      setProductos(prev => prev.filter(p => p.id !== producto.id))
      // También eliminar del mapa de salidas
      setSalidasMap(prev => {
        const nuevo = new Map(prev)
        nuevo.delete(producto.id)
        return nuevo
      })
      toast.success("Producto eliminado")
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    }
  }

  // Calcular totales por mes
  const totalesPorMes = useMemo(() => {
    const totals = new Array(12).fill(0)
    for (const prod of productosFiltrados) {
      for (let mes = 1; mes <= 12; mes++) {
        totals[mes - 1] += getConsumo(prod.id, mes)
      }
    }
    return totals
  }, [productosFiltrados, salidasMap])

  if (loading) {
    return <div style={{ padding: "40px", textAlign: "center", color: "#888" }}>Cargando datos...</div>
  }

  return (
    <div>
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept=".xlsx,.xls,.csv"
        onChange={handleFileSelected}
      />
      {/* Barra superior de controles */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          {/* Buscador */}
          <input
            type="text"
            placeholder="Buscar por referencia o nombre..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "8px", fontSize: "14px", minWidth: "220px" }}
          />
          {/* Filtro departamento */}
          {showNewDeptInput ? (
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <input
                type="text"
                placeholder="Nuevo departamento"
                value={newDeptName}
                onChange={e => setNewDeptName(e.target.value)}
                style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "8px", fontSize: "14px", minWidth: "180px" }}
                autoFocus
              />
              <button
                onClick={async () => {
                  if (!newDeptName.trim()) {
                    toast.error("Error", "Ingresa un nombre para el departamento")
                    return
                  }
                  try {
                    const nuevoId = await crearDepartamentoProd(newDeptName.trim())
                    setDepartamentoId(nuevoId)
                    setNewDeptName("")
                    setShowNewDeptInput(false)
                    // Recargar lista de departamentos
                    await handleDepartamentoCreado()
                    toast.success("Departamento creado")
                  } catch (err: any) {
                    toast.error("Error", err.message || "No se pudo crear el departamento")
                  }
                }}
                disabled={!newDeptName.trim()}
                style={{
                  padding: "8px 12px",
                  border: "none",
                  borderRadius: "8px",
                  backgroundColor: (!newDeptName.trim()) ? "#ccc" : "#16a34a",
                  color: "#fff",
                  fontSize: "14px",
                  cursor: (!newDeptName.trim()) ? "not-allowed" : "pointer"
                }}
              >
                ✓ Crear
              </button>
              <button
                onClick={() => {
                  setShowNewDeptInput(false)
                  setNewDeptName("")
                }}
                style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "8px", backgroundColor: "#fff", fontSize: "14px", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>
          ) : (
            <select
              value={departamentoId}
              onChange={e => {
                const val = e.target.value
                if (val === "nuevo") {
                  setShowNewDeptInput(true)
                } else {
                  setDepartamentoId(val === "" ? "" : Number(val))
                }
              }}
              style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "8px", fontSize: "14px" }}
            >
              <option value="">-- Todos los departamentos --</option>
              {departamentos.map(dep => (
                <option key={dep.id} value={dep.id}>{dep.nombre}</option>
              ))}
              <option value="nuevo">➕ Crear nuevo departamento...</option>
            </select>
          )}
          {/* Selector año */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <label style={{ fontSize: "14px", color: "#666" }}>Año:</label>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "14px" }}
            >
              {[year, year-1, year-2, year-3, year-4].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={handleImportClick}
            disabled={isImporting}
            style={{
              padding: "8px 16px",
              border: "1px solid #d1d5db",
              borderRadius: "8px",
              backgroundColor: "#fff",
              fontSize: "14px",
              cursor: isImporting ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              opacity: isImporting ? 0.6 : 1
            }}
          >
            {isImporting ? "Importando..." : "📥 Importar Excel"}
          </button>
          <button
            onClick={() => setEditingProductId("nuevo" as any)}
            style={{ padding: "8px 16px", border: "none", borderRadius: "8px", backgroundColor: "#16a34a", color: "#fff", fontSize: "14px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
          >
            + Nuevo producto
          </button>
        </div>
      </div>

      {/* Tabla */}
      {departamentoId === "" ? (
        <div style={{ padding: "40px", textAlign: "center", color: "#666", backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: "12px" }}>
          Selecciona un departamento para ver y editar los consumos mensuales.
        </div>
      ) : (
        <div style={{ backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: "12px", overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", whiteSpace: "nowrap" }}>
            <thead style={{ backgroundColor: "#f9fafb", position: "sticky", top: 0, zIndex: 10 }}>
              <tr>
                <th style={{ ...thStyle, minWidth: "100px" }}>Referencia</th>
                <th style={{ ...thStyle, minWidth: "200px" }}>Nombre</th>
                <th style={{ ...thStyle, minWidth: "100px" }}>Precio (€)</th>
                <th style={{ ...thStyle, minWidth: "120px" }}>Categoría</th>
                <th style={{ ...thStyle, minWidth: "80px" }}>Unidad</th>
                {MESES.map((mes, i) => (
                  <th key={i} style={{ ...thStyle, minWidth: "70px", textAlign: "center" }}>{mes}</th>
                ))}
                <th style={{ ...thStyle, minWidth: "100px", textAlign: "center" }}>Total</th>
                <th style={{ ...thStyle, minWidth: "120px", textAlign: "center" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {categorias.map(cat => {
                const prodsEnCat = productosPorCategoria.get(cat.id) || []
                if (prodsEnCat.length === 0) return null
                const isExpanded = expandedCategories.has(cat.id)

                return (
                  <tbody key={cat.id}>
                    {/* Fila de categoría */}
                    <tr
                      style={{ backgroundColor: "#f3f4f6", cursor: "pointer" }}
                      onClick={() => toggleCategory(cat.id)}
                    >
                      <td colSpan={5} style={{ padding: "10px 12px", fontWeight: 700, color: "#374151", display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "12px", transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▶</span>
                        {cat.nombre} ({prodsEnCat.length})
                      </td>
                    </tr>

                    {/* Filas de productos (solo si expandida) */}
                    {isExpanded && prodsEnCat.map(prod => {
                      const totalProd = MESES.reduce((sum, _, idx) => sum + getConsumo(prod.id, idx + 1), 0)
                      return (
                        <tr key={prod.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                          <td style={tdStyle}>
                            <div style={{ fontWeight: 600, color: "#2563eb", fontSize: "13px" }}>{prod.referencia}</div>
                          </td>
                          <td style={tdStyle}>
                            <div style={{ fontSize: "13px", color: "#444" }}>{prod.nombre}</div>
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right", fontSize: "13px", color: "#666" }}>
                            {prod.precio !== null && prod.precio !== undefined
                              ? prod.precio.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"
                              : "-"}
                          </td>
                          <td style={tdStyle}>
                            <div style={{ fontSize: "12px", color: "#666" }}>{cat.nombre}</div>
                          </td>
                          <td style={{ ...tdStyle, fontSize: "12px", fontStyle: "italic", color: "#666" }}>{prod.unidad_medida}</td>
                          {MESES.map((_, idx) => {
                            const mes = idx + 1
                            const valor = getConsumo(prod.id, mes)
                            const isSaving = savingCell?.productoId === prod.id && savingCell?.mes === mes
                            return (
                              <td key={mes} style={{ padding: "4px", textAlign: "center" }}>
                                <input
                                  type="number"
                                  min="0"
                                  value={valor}
                                  onChange={e => handleCellChange(prod.id, mes, e.target.value)}
                                  disabled={isSaving}
                                  style={{
                                    width: "60px",
                                    padding: "4px",
                                    border: "1px solid #e5e7eb",
                                    borderRadius: "4px",
                                    textAlign: "center",
                                    fontSize: "12px",
                                    backgroundColor: isSaving ? "#f5f5f5" : "#fff",
                                    color: "#374151",
                                  }}
                                />
                              </td>
                            )
                          })}
                          <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, fontSize: "13px", color: "#16a34a" }}>
                            {totalProd.toLocaleString()}
                          </td>
                          <td style={{ ...tdStyle, textAlign: "center" }}>
                            <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
                              <button
                                onClick={() => setEditingProductId(prod.id)}
                                style={{ padding: "4px 10px", border: "1px solid #e5e7eb", borderRadius: "6px", backgroundColor: "#fff", fontSize: "12px", cursor: "pointer", color: "#444" }}
                              >
                                Editar
                              </button>
                              <button
                                onClick={() => handleDeleteProduct(prod)}
                                style={{ padding: "4px 10px", border: "1px solid #fca5a5", borderRadius: "6px", backgroundColor: "#fff", fontSize: "12px", cursor: "pointer", color: "#dc2626" }}
                              >
                                Eliminar
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                )
              })}

              {/* Fila de totales */}
              {productosFiltrados.length > 0 && (
                <tbody>
                  <tr style={{ backgroundColor: "#e5e7eb", fontWeight: 700 }}>
                    <td colSpan={5} style={{ padding: "12px", textAlign: "right", color: "#374151" }}>TOTALES</td>
                    {totalesPorMes.map((total, i) => (
                      <td key={i} style={{ padding: "12px", textAlign: "center", color: "#16a34a" }}>
                        {total.toLocaleString()}
                      </td>
                    ))}
                    <td style={{ padding: "12px", textAlign: "right", color: "#16a34a" }}>
                      {totalesPorMes.reduce((a, b) => a + b, 0).toLocaleString()}
                    </td>
                    <td></td>
                  </tr>
                </tbody>
              )}

              {/* Mensaje si no hay productos */}
              {productosFiltrados.length === 0 && (
                <tbody>
                  <tr>
                    <td colSpan={19} style={{ padding: "40px", textAlign: "center", color: "#999" }}>
                      No se encontraron productos
                    </td>
                  </tr>
                </tbody>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modales */}
      {editingProductId !== null && (
        <ModalProducto
          producto={editingProductId === "nuevo" ? null : productos.find(p => p.id === editingProductId) || null}
          onClose={() => setEditingProductId(null)}
          onSaved={async () => {
            await loadInitialData()
            await loadSalidas()
            setEditingProductId(null)
          }}
          categorias={categorias}
        />
      )}

    </div>
  )
}

// Estilos reutilizables
const thStyle: React.CSSProperties = {
  padding: "10px 12px",
  textAlign: "left",
  backgroundColor: "#f9fafb",
  borderBottom: "1px solid #e5e7eb",
  fontWeight: 600,
  color: "#666",
  fontSize: "11px",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
}

const tdStyle: React.CSSProperties = {
  padding: "8px 12px",
  color: "#444",
  fontSize: "13px",
  borderBottom: "1px solid #f0f0f0",
}
