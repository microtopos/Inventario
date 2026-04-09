import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from "react"
import { useConfirm } from "./ConfirmDialog"
import { useToast } from "./Toast"
import * as XLSX from "xlsx"
import {
  getCategorias,
  getProductos,
  getDepartamentosProd,
  deleteProduct,
  upsertSalida,
  crearDepartamentoProd,
  crearCategoria,
  ensureProduct,
  getSalidasByYear,
  getAniosDisponibles,
  type CategoriaProducto,
  type ProductoAlmacen,
  type DepartamentoProd,
} from "./productosService"
import { ModalProducto } from "./ProductModal"
import { ModalSalida } from "./SalidaModal"

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

// VistaCatalogoMejorada.tsx — Mejoras de visualización
// ============================================================================
// Paleta de colores para consumo (heatmap)
function getConsumoColor(valor: number, maxValor: number): string {
  if (valor === 0) return "#ffffff"
  const intensidad = Math.min(valor / (maxValor || 1), 1)
  // De amarillo claro a verde oscuro
  if (intensidad < 0.25) return "#fef9c3" // amarillo muy claro
  if (intensidad < 0.5) return "#fef08a"  // amarillo
  if (intensidad < 0.75) return "#bef264"  // verde lima
  return "#65a30d"                        // verde oscuro
}

function getConsumoTextColor(valor: number): string {
  return valor > 0 ? "#1a1a1a" : "#9ca3af"
}

// Helper para calcular el valor máximo de consumo en la vista actual (para escalado de colores)
function calcularMaximoConsumo(productosFiltrados: ProductoAlmacen[], getConsumo: (id: number, mes: number) => number): number {
  let max = 0
  for (const prod of productosFiltrados) {
    for (let mes = 1; mes <= 12; mes++) {
      max = Math.max(max, getConsumo(prod.id, mes))
    }
  }
  return max
}

// Total de columnas: Ref + Nombre + Precio + Categoría + Unidad + 12 meses + Total + Acciones
const TOTAL_COLS = 20

// Componente principal
export default function VistaCatalogoMejorada({ onDepartamentoCreado }: { onDepartamentoCreado?: () => void }) {
  const toast = useToast()
  const { confirm, dialog } = useConfirm()
  const [showSalidaModal, setShowSalidaModal] = useState(false)

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
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [deptSearchTerm, setDeptSearchTerm] = useState("")
  const [showDeptDropdown, setShowDeptDropdown] = useState(false)
  const deptInputRef = useRef<HTMLDivElement>(null)

  // Mapa de salidas: producto_id -> mes -> cantidad
  const [salidasMap, setSalidasMap] = useState<Map<number, Map<number, number>>>(new Map())

  // Ref para almacenar el departamento/año para el cual están cargados los datos actuales
  const cachedDeptYearRef = useRef<{ dept: number | ""; year: number } | null>(null)

  // Carga inicial de datos (useCallback para usar en useEffect)
  const loadInitialData = useCallback(async () => {
    setLoading(true)
    try {
      const [cats, prods, depts, anios] = await Promise.all([
        getCategorias(),
        getProductos(false), // todos, incluyendo inactivos para verlos
        getDepartamentosProd(),
        getAniosDisponibles(),
      ])
      setCategorias(cats)
      setProductos(prods)
      setDepartamentos(depts)
      setAvailableYears(anios)
      // Expandir todas las categorías por defecto
      setExpandedCategories(new Set(cats.map(c => c.id)))
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }, [toast])

  // Cargar salidas para departamento/año específico
  const cargarSalidas = useCallback(async () => {
    if (departamentoId === "") {
      // Cuando no hay departamento seleccionado, limpiar el mapa y la caché
      setSalidasMap(new Map())
      cachedDeptYearRef.current = null
      return
    }

    const deptAlMomento = departamentoId
    const yearAlMomento = year

    // Si ya tenemos datos cargados para este departamento/año, no hacer nada
    if (cachedDeptYearRef.current?.dept === deptAlMomento && cachedDeptYearRef.current.year === yearAlMomento) {
      return
    }

    try {
      const mapa = await getSalidasByYear(yearAlMomento, Number(deptAlMomento))

      // Actualizar el mapa y marcar como caché actual
      setSalidasMap(mapa)
      cachedDeptYearRef.current = { dept: deptAlMomento, year: yearAlMomento }
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
      // En caso de error, limpiar la caché para permitir reintento
      cachedDeptYearRef.current = null
    }
  }, [departamentoId, year, toast])

  // Carga inicial
  useEffect(() => {
    loadInitialData()
  }, [loadInitialData])

  // Cada vez que cambia departamento o año, recargar salidas
  useEffect(() => {
    if (departamentoId === "") {
      // Limpiar cuando no hay departamento seleccionado
      setSalidasMap(new Map())
      cachedDeptYearRef.current = null
    }
  }, [departamentoId])

  useEffect(() => {
    if (departamentoId !== "" && year) {
      cargarSalidas()
    }
  }, [departamentoId, year, cargarSalidas])

  // Auto-seleccionar el primer departamento cuando se carga la lista
  useEffect(() => {
    if (departamentoId === "" && departamentos.length > 0) {
      setDepartamentoId(departamentos[0].id)
    }
  }, [departamentos, departamentoId])

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (deptInputRef.current && !deptInputRef.current.contains(e.target as Node)) {
        setShowDeptDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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

  // Departamentos filtrados por búsqueda
  const departamentosFiltrados = useMemo(() => {
    if (!deptSearchTerm.trim()) return departamentos
    const term = deptSearchTerm.toLowerCase()
    return departamentos.filter(dep =>
      dep.nombre.toLowerCase().includes(term)
    )
  }, [departamentos, deptSearchTerm])

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
          // Error ya mostrado en toast superior, solo incrementar contador
          importedCount++
        }

        if ((i + 1) % batchSize === 0 && i < productos.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 150));
        }
      }

      toast.success("Importación completada", `Se importaron ${importedCount} productos`);
      await loadInitialData();
      await cargarSalidas();
    } catch (err: any) {
      toast.error("Error importando archivo", err.message || String(err));
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };


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

      // Mantener la caché actualizada (seguimos en el mismo dept/año)
      if (cachedDeptYearRef.current?.dept === Number(departamentoId) && cachedDeptYearRef.current.year === year) {
        cachedDeptYearRef.current = { dept: Number(departamentoId), year }
      }
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

      // Mantener la caché actualizada (seguimos en el mismo dept/año)
      if (cachedDeptYearRef.current?.dept === Number(departamentoId) && cachedDeptYearRef.current.year === year) {
        cachedDeptYearRef.current = { dept: Number(departamentoId), year }
      }

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

  // Calcular máximo consumo para escalado de colores (evita colores muy saturados)
  const maxConsumo = useMemo(() => {
    return calcularMaximoConsumo(productosFiltrados, getConsumo)
  }, [productosFiltrados])

  if (loading) {
    return <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>Cargando datos...</div>
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

      {/* Barra superior de controles — card */}
      <div style={{
        backgroundColor: "#fff",
        border: "1px solid #f1f5f9",
        borderRadius: "16px",
        padding: "16px 20px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        marginBottom: "16px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          {/* Buscador */}
          <input
            type="text"
            placeholder="🔍 Buscar referencia o nombre..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              padding: "10px 14px",
              border: "1.5px solid #e2e8f0",
              borderRadius: "10px",
              fontSize: "14px",
              minWidth: "260px",
              transition: "border-color 0.15s",
              backgroundColor: "#fff",
              outline: "none",
              color: "#334155",
            }}
          />
          {/* Selector de departamento simple con búsqueda */}
          <div style={{ position: "relative" }} ref={deptInputRef}>
            {showNewDeptInput ? (
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <input
                  type="text"
                  placeholder="Nuevo departamento"
                  value={newDeptName}
                  onChange={e => setNewDeptName(e.target.value)}
                  style={{ padding: "8px 12px", border: "2px solid #3b82f6", borderRadius: "8px", fontSize: "14px", minWidth: "200px" }}
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
              <>
                <div
                  onClick={() => setShowDeptDropdown(!showDeptDropdown)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "10px 14px",
                    border: showDeptDropdown ? "2px solid #3b82f6" : "2px solid #e5e7eb",
                    borderRadius: "10px",
                    backgroundColor: "#fff",
                    cursor: "pointer",
                    minWidth: "260px",
                    boxShadow: showDeptDropdown ? "0 0 0 3px rgba(59, 130, 246, 0.1)" : "none"
                  }}
                >
                  <span style={{ fontSize: "14px", color: "#6b7280" }}>🏢</span>
                  <span style={{
                    flex: 1,
                    fontSize: "14px",
                    color: departamentoId === "" ? "#9ca3af" : "#374151",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  }}>
                    {departamentoId === "" ? "Todos los departamentos" : departamentos.find(d => d.id === departamentoId)?.nombre || "Seleccionar..."}
                  </span>
                  <span style={{
                    fontSize: "12px",
                    transition: "transform 0.2s",
                    transform: showDeptDropdown ? "rotate(180deg)" : "rotate(0deg)",
                    color: "#6b7280"
                  }}>▼</span>
                </div>

                {/* Dropdown de departamentos */}
                {showDeptDropdown && (
                  <div style={{
                    position: "absolute",
                    top: "calc(100% + 4px)",
                    left: 0,
                    right: 0,
                    backgroundColor: "#fff",
                    border: "2px solid #e5e7eb",
                    borderRadius: "10px",
                    boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
                    zIndex: 1000,
                    maxHeight: "300px",
                    overflowY: "auto",
                  }}>
                    {/* Input de búsqueda */}
                    <div style={{ padding: "8px 12px", borderBottom: "1px solid #e5e7eb", position: "sticky", top: 0, backgroundColor: "#fff" }}>
                      <input
                        type="text"
                        placeholder="🔍 Filtrar departamentos..."
                        value={deptSearchTerm}
                        onChange={(e) => setDeptSearchTerm(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          border: "1px solid #e5e7eb",
                          borderRadius: "6px",
                          fontSize: "13px",
                          outline: "none",
                          boxSizing: "border-box"
                        }}
                        autoFocus
                      />
                    </div>

                    {/* Opción "Todos" */}
                    <div
                      onClick={() => {
                        setDepartamentoId("")
                        setDeptSearchTerm("")
                        setShowDeptDropdown(false)
                      }}
                      style={{
                        padding: "10px 14px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        backgroundColor: departamentoId === "" ? "#dbeafe" : "transparent",
                        color: departamentoId === "" ? "#1e40af" : "#374151",
                        fontWeight: departamentoId === "" ? 600 : 400,
                        fontSize: "13px",
                        borderBottom: "1px solid #f3f4f6"
                      }}
                      onMouseEnter={e => {
                        if (departamentoId !== "") e.currentTarget.style.backgroundColor = "#f3f4f6"
                      }}
                      onMouseLeave={e => {
                        if (departamentoId !== "") e.currentTarget.style.backgroundColor = "transparent"
                      }}
                    >
                      <span>📁</span>
                      <span>Todos los departamentos</span>
                    </div>

                    {/* Lista filtrada */}
                    {departamentosFiltrados.length === 0 ? (
                      <div style={{
                        padding: "16px",
                        textAlign: "center",
                        color: "#9ca3af",
                        fontSize: "13px"
                      }}>
                        No se encontraron departamentos
                      </div>
                    ) : (
                      departamentosFiltrados.map(dep => (
                        <div
                          key={dep.id}
                          onClick={() => {
                            setDepartamentoId(dep.id)
                            setDeptSearchTerm("")
                            setShowDeptDropdown(false)
                          }}
                          style={{
                            padding: "10px 14px",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            backgroundColor: departamentoId === dep.id ? "#dbeafe" : "transparent",
                            color: departamentoId === dep.id ? "#1e40af" : "#374151",
                            fontWeight: departamentoId === dep.id ? 600 : 400,
                            fontSize: "13px"
                          }}
                          onMouseEnter={e => {
                            if (departamentoId !== dep.id) e.currentTarget.style.backgroundColor = "#f3f4f6"
                          }}
                          onMouseLeave={e => {
                            if (departamentoId !== dep.id) e.currentTarget.style.backgroundColor = "transparent"
                          }}
                        >
                          <span>🏢</span>
                          <span>{dep.nombre}</span>
                        </div>
                      ))
                    )}

                    {/* Crear nuevo departamento */}
                    <div style={{ borderTop: "1px solid #e5e7eb" }}>
                      <div
                        onClick={() => {
                          setShowDeptDropdown(false)
                          setShowNewDeptInput(true)
                          setDeptSearchTerm("")
                        }}
                        style={{
                          padding: "12px 14px",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          backgroundColor: "#f0fdf4",
                          color: "#16a34a",
                          fontWeight: 500
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = "#dcfce7"}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = "#f0fdf4"}
                      >
                        <span>➕</span>
                        <span style={{ fontSize: "13px" }}>Crear nuevo departamento...</span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          {/* Selector año */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <label style={{ fontSize: "14px", color: "#666" }}>Año:</label>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "14px" }}
            >
              {availableYears.length > 0 ? (
                availableYears.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))
              ) : (
                <option value={year}>{year}</option>
              )}
            </select>
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button
            onClick={handleImportClick}
            disabled={isImporting}
            style={{
              padding: "10px 16px",
              border: "1.5px solid #e2e8f0",
              borderRadius: "10px",
              backgroundColor: "#fff",
              fontSize: "13px",
              fontWeight: 500,
              cursor: isImporting ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              color: "#475569",
              opacity: isImporting ? 0.5 : 1,
              transition: "all 0.15s",
            }}
          >
            {isImporting ? "Importando..." : "📥 Importar Excel"}
          </button>
          <button
            onClick={() => setShowSalidaModal(true)}
            style={{
              padding: "10px 20px",
              border: "none",
              borderRadius: "10px",
              backgroundColor: "#f97316",
              color: "#fff",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 2px 8px rgba(249,115,22,0.25)",
              transition: "all 0.15s"
            }}
          >
            + Nueva Salida
          </button>
          <button
            onClick={() => setEditingProductId("nuevo" as any)}
            style={{
              padding: "10px 10px",
              border: "none",
              borderRadius: "10px",
              backgroundColor: "#dcfce7",
              color: "#15803d",
              fontSize: "12px",
              fontWeight: 400,
              cursor: "pointer",
              transition: "all 0.15s",
              marginLeft: "auto",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = "#bbf7d0"
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = "#dcfce7"
            }}
          >
            + nuevo producto
          </button>
        </div>
        </div>
      </div>

      {/* Tabla */}
      {departamentoId === "" ? (
        <div style={{
          padding: "60px",
          textAlign: "center",
          color: "#6b7280",
          backgroundColor: "#fff",
          border: "2px dashed #e5e7eb",
          borderRadius: "16px"
        }}>
          <div style={{ fontSize: "18px", fontWeight: 600, marginBottom: "12px" }}>
            📊 Selecciona un departamento
          </div>
          <div style={{ fontSize: "14px" }}>
            Elige un departamento del menú desplegable para ver y editar los consumos mensuales.
          </div>
        </div>
      ) : (
        <div style={{
          backgroundColor: "#fff",
          border: "2px solid #e5e7eb",
          borderRadius: "16px",
          overflow: "auto",
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)"
        }}>
          {/* Leyenda de colores */}
          <div style={{
            padding: "10px 16px",
            backgroundColor: "#f9fafb",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            gap: "16px",
            fontSize: "11px",
            color: "#6b7280",
            flexWrap: "wrap"
          }}>
            <span style={{ fontWeight: 600, color: "#374151", fontSize: "12px" }}>Intensidad de consumo:</span>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <div style={{ width: "14px", height: "14px", backgroundColor: "#ffffff", border: "1px solid #d1d5db", borderRadius: "3px" }}></div>
              <span>Ninguno</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <div style={{ width: "14px", height: "14px", backgroundColor: "#fef08a", border: "1px solid #facc15", borderRadius: "3px" }}></div>
              <span>Bajo</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <div style={{ width: "14px", height: "14px", backgroundColor: "#bef264", border: "1px solid #a3e635", borderRadius: "3px" }}></div>
              <span>Medio</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <div style={{ width: "14px", height: "14px", backgroundColor: "#65a30d", border: "1px solid #4d7c0f", borderRadius: "3px" }}></div>
              <span>Alto</span>
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: "13px", whiteSpace: "nowrap" }}>
            <thead style={{ position: "sticky", top: 48, zIndex: 10 }}>
              <tr>
                <th style={{ ...thStyle, position: "sticky", left: 0, zIndex: 3, minWidth: "110px", boxShadow: "2px 0 4px -2px rgba(0,0,0,0.15)" }}>Referencia</th>
                <th style={{ ...thStyle, position: "sticky", left: "110px", zIndex: 2, minWidth: "220px", boxShadow: "2px 0 4px -2px rgba(0,0,0,0.1)" }}>Nombre</th>
                <th style={{ ...thStyle, minWidth: "100px" }}>Precio (€)</th>
                <th style={{ ...thStyle, minWidth: "120px" }}>Categoría</th>
                <th style={{ ...thStyle, minWidth: "80px" }}>Unidad</th>
                {MESES.map((mes, i) => (
                  <th key={i} style={{ ...thStyle, minWidth: "70px", textAlign: "center" }}>{mes}</th>
                ))}
                <th style={{ ...thStyle, minWidth: "100px", textAlign: "center" }}>Total</th>
                <th style={{ ...thStyle, position: "sticky", right: 0, zIndex: 3, minWidth: "130px", textAlign: "center", boxShadow: "-2px 0 4px -2px rgba(0,0,0,0.15)" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {categorias.map(cat => {
                const prodsEnCat = productosPorCategoria.get(cat.id) || []
                if (prodsEnCat.length === 0) return null
                const isExpanded = expandedCategories.has(cat.id)

                return (
                  <Fragment key={cat.id}>
                    {/* Fila de categoría */}
                    <tr
                      style={{
                        backgroundColor: isExpanded ? "#eff6ff" : "#f8fafc",
                        cursor: "pointer",
                        borderBottom: "1px solid #f1f5f9",
                        transition: "background-color 0.15s"
                      }}
                      onClick={() => toggleCategory(cat.id)}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#eff6ff" }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = isExpanded ? "#eff6ff" : "#f8fafc" }}
                    >
                      <td colSpan={TOTAL_COLS} style={{ padding: "10px 16px", fontWeight: 700, color: "#1e40af", verticalAlign: "middle", position: "sticky", left: 0, backgroundColor: isExpanded ? "#eff6ff" : "#f8fafc", zIndex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{
                            fontSize: "12px",
                            transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                            transition: "transform 0.2s",
                            color: "#3b82f6"
                          }}>▶</span>
                          <span style={{ fontSize: "13px" }}>{cat.nombre}</span>
                          <span style={{
                            fontSize: "10px",
                            padding: "2px 8px",
                            borderRadius: "10px",
                            backgroundColor: isExpanded ? "#dbeafe" : "#e2e8f0",
                            color: isExpanded ? "#2563eb" : "#64748b",
                            fontWeight: 600
                          }}>{prodsEnCat.length}</span>
                        </div>
                      </td>
                    </tr>

                    {/* Filas de productos (solo si expandida) */}
                    {isExpanded && prodsEnCat.map(prod => {
                      const totalProd = MESES.reduce((sum, _, idx) => sum + getConsumo(prod.id, idx + 1), 0)
                      return (
                        <tr
                          key={prod.id}
                          style={{
                            borderBottom: "1px solid #f1f5f9",
                            backgroundColor: prod.activo === false ? "#fafafa" : "#fff",
                            transition: "background-color 0.15s"
                          }}
                          onMouseEnter={e => { if (prod.activo !== false) e.currentTarget.style.backgroundColor = "#f8fafc" }}
                          onMouseLeave={e => { if (prod.activo !== false) e.currentTarget.style.backgroundColor = "#fff" }}
                        >
                          <td style={{ ...tdStyle, position: "sticky", left: 0, zIndex: 3, backgroundColor: "#fff", boxShadow: "2px 0 4px -2px rgba(0,0,0,0.12)" }}>
                            <div style={{ fontWeight: 700, color: prod.activo === false ? "#9ca3af" : "#1d4ed8", fontSize: "13px", display: "flex", alignItems: "center", gap: "6px" }}>
                              {prod.referencia}
                              {prod.activo === false && (
                                <span style={{
                                  fontSize: "10px",
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                  backgroundColor: "#f3f4f6",
                                  color: "#6b7280",
                                  fontWeight: 500,
                                  border: "1px solid #e5e7eb"
                                }}>INACTIVO</span>
                              )}
                            </div>
                          </td>
                          <td style={{ ...tdStyle, position: "sticky", left: "110px", zIndex: 2, backgroundColor: "#fff", boxShadow: "2px 0 4px -2px rgba(0,0,0,0.08)" }}>
                            <div style={{
                              fontSize: "13px",
                              color: prod.activo === false ? "#9ca3af" : "#1f2937",
                              fontWeight: prod.activo === false ? 400 : 500
                            }}>
                              {prod.nombre}
                            </div>
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right", fontSize: "13px", color: "#666" }}>
                            {prod.precio !== null && prod.precio !== undefined
                              ? prod.precio.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"
                              : "-"}
                          </td>
                          <td style={{ ...tdStyle }}>
                            <span style={{
                              display: "inline-block",
                              padding: "3px 10px",
                              borderRadius: "9999px",
                              backgroundColor: "#e0e7ff",
                              color: "#3730a3",
                              fontSize: "11px",
                              fontWeight: 600,
                            }}>
                              {cat.nombre}
                            </span>
                          </td>
                          <td style={{ ...tdStyle, fontSize: "12px", fontStyle: "italic", color: "#666" }}>{prod.unidad_medida}</td>
                          {MESES.map((_, idx) => {
                            const mes = idx + 1
                            const valor = getConsumo(prod.id, mes)
                            const isSaving = savingCell?.productoId === prod.id && savingCell?.mes === mes
                            const bgColor = getConsumoColor(valor, maxConsumo)
                            const textColor = getConsumoTextColor(valor)
                            return (
                              <td key={mes} style={{ padding: "4px", textAlign: "center", backgroundColor: bgColor }}>
                                <input
                                  type="number"
                                  min="0"
                                  value={valor}
                                  onChange={e => handleCellChange(prod.id, mes, e.target.value)}
                                  disabled={isSaving}
                                  style={{
                                    width: "60px",
                                    padding: "4px",
                                    border: "1px solid #d1d5db",
                                    borderRadius: "4px",
                                    textAlign: "center",
                                    fontSize: "12px",
                                    backgroundColor: isSaving ? "#f5f5f5" : "rgba(255,255,255,0.92)",
                                    color: textColor,
                                    fontWeight: valor > 0 ? 600 : 400,
                                    cursor: "pointer",
                                    transition: "all 0.15s",
                                    outline: "none",
                                    boxShadow: valor > 0 ? "0 0 0 1px rgba(34,197,94,0.25)" : "none",
                                    borderColor: valor > 0 ? "#93c5fd" : "#d1d5db",
                                  }}
                                  onMouseEnter={e => {
                                    if (!isSaving) {
                                      e.currentTarget.style.borderColor = "#3b82f6"
                                      e.currentTarget.style.boxShadow = `0 0 0 2px ${valor > 0 ? "rgba(59,130,246,0.2)" : "rgba(59,130,246,0.12)"}`
                                    }
                                  }}
                                  onMouseLeave={e => {
                                    e.currentTarget.style.borderColor = valor > 0 ? "#93c5fd" : "#d1d5db"
                                    e.currentTarget.style.boxShadow = valor > 0 ? "0 0 0 1px rgba(34,197,94,0.25)" : "none"
                                  }}
                                />
                              </td>
                            )
                          })}
                          <td style={{
                            ...tdStyle,
                            textAlign: "right",
                            fontWeight: 700,
                            fontSize: "13px",
                            color: "#059669",
                            backgroundColor: totalProd > 0 ? "#ecfdf5" : "transparent"
                          }}>
                            {totalProd.toLocaleString()}
                          </td>
                          <td style={{ ...tdStyle, position: "sticky", right: 0, zIndex: 3, backgroundColor: "#fff", boxShadow: "-2px 0 4px -2px rgba(0,0,0,0.12)" }}>
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
                  </Fragment>
                )
              })}

              {/* Fila de totales */}
              {productosFiltrados.length > 0 && (
                <tr style={{ backgroundColor: "#111827", fontWeight: 700 }}>
                  <td colSpan={5} style={{ padding: "14px", textAlign: "right", color: "#f9fafb", fontSize: "13px" }}>TOTALES</td>
                  {totalesPorMes.map((total, i) => (
                    <td key={i} style={{ padding: "14px", textAlign: "center", color: "#fbbf24", fontSize: "14px" }}>
                      {total.toLocaleString()}
                    </td>
                  ))}
                  <td style={{ padding: "14px", textAlign: "right", color: "#fbbf24", fontSize: "14px" }}>
                    {totalesPorMes.reduce((a, b) => a + b, 0).toLocaleString()}
                  </td>
                  <td></td>
                </tr>
              )}

              {/* Mensaje si no hay productos */}
              {productosFiltrados.length === 0 && (
                <tr>
                  <td colSpan={TOTAL_COLS} style={{
                    padding: "60px",
                    textAlign: "center",
                    color: "#6b7280",
                    backgroundColor: "#fafafa"
                  }}>
                    <div style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>
                      No se encontraron productos
                    </div>
                    <div style={{ fontSize: "13px" }}>
                      {searchTerm ? "Intenta con otro término de búsqueda" : "Agrega productos usando el botón '+ Nuevo producto'"}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Diálogo de confirmación */}
      {dialog}

      {/* Modales */}
      {editingProductId !== null && (
        <ModalProducto
          producto={editingProductId === "nuevo" ? null : productos.find(p => p.id === editingProductId) || null}
          onClose={() => setEditingProductId(null)}
          onSaved={async () => {
            await loadInitialData()
            await cargarSalidas()
            setEditingProductId(null)
          }}
          categorias={categorias}
        />
      )}

      {showSalidaModal && (
        <ModalSalida
          onClose={async () => {
            setShowSalidaModal(false)
            await loadInitialData()
            await cargarSalidas()
          }}
        />
      )}

    </div>
  )
}

// Estilos reutilizables mejorados
const thStyle: React.CSSProperties = {
  padding: "12px 16px",
  textAlign: "left",
  backgroundColor: "#3b82f6",
  borderBottom: "2px solid #2563eb",
  fontWeight: 700,
  color: "#ffffff",
  fontSize: "11px",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
}

const tdStyle: React.CSSProperties = {
  padding: "10px 16px",
  color: "#374151",
  fontSize: "13px",
  borderBottom: "1px solid #e5e7eb",
}
