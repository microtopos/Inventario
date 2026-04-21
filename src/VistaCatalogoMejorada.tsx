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
  getUnidadesPresentacion,
  getAllPresentaciones,
  upsertPresentacion,
  deletePresentacion,
  crearUnidadPresentacion,
  claveSalida,
  type CategoriaProducto,
  type ProductoAlmacen,
  type DepartamentoProd,
  type UnidadPresentacion,
  type ProductoPresentacion,
} from "./productosService"
import { ModalProducto } from "./ProductModal"
import { ModalSalida } from "./SalidaModal"

async function getOrCreateCategoriaId(nombre: string): Promise<number> {
  const cats = await getCategorias()
  const existente = cats.find(c => c.nombre.toUpperCase() === nombre.toUpperCase())
  if (existente) return existente.id
  return await crearCategoria(nombre)
}

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
]

// ─── Colores heatmap ──────────────────────────────────────────────────────────

function getConsumoColor(valor: number, maxValor: number): string {
  if (valor === 0) return "#ffffff"
  const intensidad = Math.min(valor / (maxValor || 1), 1)
  if (intensidad < 0.25) return "#fef9c3"
  if (intensidad < 0.5)  return "#fef08a"
  if (intensidad < 0.75) return "#bef264"
  return "#65a30d"
}

function getConsumoTextColor(valor: number): string {
  return valor > 0 ? "#1a1a1a" : "#9ca3af"
}

// ─── Constantes ───────────────────────────────────────────────────────────────

// Ref + Nombre + Precio + Categoría + Unidad + 12 meses + Total + Acciones
const TOTAL_COLS = 20

// ─── Componente principal ────────────────────────────────────────────────────

export default function VistaCatalogoMejorada({ onDepartamentoCreado }: { onDepartamentoCreado?: () => void }) {
  const toast = useToast()
  const { confirm, dialog } = useConfirm()

  // ── Modales ──
  const [showSalidaModal, setShowSalidaModal] = useState(false)
  const [editingProductId, setEditingProductId] = useState<number | null>(null)

  // Modal añadir presentación a un producto
  const [showPresModal, setShowPresModal] = useState(false)
  const [presModalProductoId, setPresModalProductoId] = useState<number | null>(null)
  const [presModalUnidadId, setPresModalUnidadId] = useState<number | "">("")
  const [presModalPrecio, setPresModalPrecio] = useState("")
  // Modal nueva unidad global
  const [showNewUnitModal, setShowNewUnitModal] = useState(false)
  const [newUnitName, setNewUnitName] = useState("")

  // ── Datos principales ──
  const [categorias, setCategorias] = useState<CategoriaProducto[]>([])
  const [productos, setProductos] = useState<ProductoAlmacen[]>([])
  const [departamentos, setDepartamentos] = useState<DepartamentoProd[]>([])
  const [unidadesPresentacion, setUnidadesPresentacion] = useState<UnidadPresentacion[]>([])
  // mapa producto_id → presentaciones configuradas
  const [presentacionesPorProducto, setPresentacionesPorProducto] = useState<Map<number, ProductoPresentacion[]>>(new Map())

  // ── Filtros ──
  const [departamentoId, setDepartamentoId] = useState<number | "">("")
  const [year, setYear] = useState(new Date().getFullYear())
  const [searchTerm, setSearchTerm] = useState("")
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set())

  // ── Presentación activa por producto (qué fila se muestra) ──
  // producto_id → presentacion_id (null = "sin presentación")
  const [presentacionActiva, setPresentacionActiva] = useState<Map<number, number | null>>(new Map())

  // ── Salidas: mapa "productoId_presentacionId" → mes → cantidad ──
  const [salidasMap, setSalidasMap] = useState<Map<string, Map<number, number>>>(new Map())

  // ── UI helpers ──
  const [loading, setLoading] = useState(true)
  const [savingCell, setSavingCell] = useState<{ clave: string; mes: number; tipoUnidad: string | null } | null>(null)
  const [showNewDeptInput, setShowNewDeptInput] = useState(false)
  const [newDeptName, setNewDeptName] = useState("")
  const [isImporting, setIsImporting] = useState(false)
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cachedDeptYearRef = useRef<{ dept: number | ""; year: number } | null>(null)

  // ─── Carga inicial ────────────────────────────────────────────────────────

  const loadInitialData = useCallback(async () => {
    setLoading(true)
    try {
      const [cats, prods, depts, anios, unidades, todasPresentaciones] = await Promise.all([
        getCategorias(),
        getProductos(false),
        getDepartamentosProd(),
        getAniosDisponibles(),
        getUnidadesPresentacion(),
        getAllPresentaciones(),
      ])
      setCategorias(cats)
      setProductos(prods)
      setDepartamentos(depts)
      setAvailableYears(anios)
      setUnidadesPresentacion(unidades)
      setPresentacionesPorProducto(todasPresentaciones)
      setExpandedCategories(new Set(cats.map(c => c.id)))

      // Inicializar presentación activa: primer elemento de cada producto (o null si no tiene)
      const activaInicial = new Map<number, number | null>()
      for (const prod of prods) {
        const lista = todasPresentaciones.get(prod.id) ?? []
        activaInicial.set(prod.id, lista.length > 0 ? lista[0].id : null)
      }
      setPresentacionActiva(activaInicial)

    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }, [toast])

  // ─── Carga de salidas ──────────────────────────────────────────────────────

  const cargarSalidas = useCallback(async () => {
    if (departamentoId === "") {
      setSalidasMap(new Map())
      cachedDeptYearRef.current = null
      return
    }

    if (
      cachedDeptYearRef.current?.dept === departamentoId &&
      cachedDeptYearRef.current.year === year
    ) return

    try {
      const mapa = await getSalidasByYear(year, Number(departamentoId))
      setSalidasMap(mapa)
      cachedDeptYearRef.current = { dept: departamentoId, year }
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
      cachedDeptYearRef.current = null
      setSalidasMap(new Map())
    }
  }, [departamentoId, year, toast])

  useEffect(() => { loadInitialData() }, [loadInitialData])

  useEffect(() => {
    if (departamentoId === "") {
      setSalidasMap(new Map())
      cachedDeptYearRef.current = null
    }
  }, [departamentoId])

  useEffect(() => {
    if (departamentoId !== "" && year) cargarSalidas()
  }, [departamentoId, year, cargarSalidas])

  // Auto-seleccionar primer departamento
  useEffect(() => {
    if (departamentoId === "" && departamentos.length > 0) {
      setDepartamentoId(departamentos[0].id)
    }
  }, [departamentos, departamentoId])

  // ─── Helpers de presentación ──────────────────────────────────────────────

  /** Presentación actualmente seleccionada para un producto */
  function getPresActiva(productoId: number): ProductoPresentacion | null {
    const presId = presentacionActiva.get(productoId)
    if (presId == null) return null
    return presentacionesPorProducto.get(productoId)?.find(p => p.id === presId) ?? null
  }

  /** Salidas para la presentación activa de un producto en un mes */
  function getConsumo(productoId: number, mes: number): number {
    const presId = presentacionActiva.get(productoId) ?? null
    const tipoPres = presId !== null ? presId : undefined
    const clave = claveSalida(productoId, presId, tipoPres)
    return salidasMap.get(clave)?.get(mes) ?? 0
  }

  // ─── Actualizar celda ─────────────────────────────────────────────────────

  const handleCellChange = useCallback(async (
    productoId: number,
    mes: number,
    valorStr: string
  ) => {
    if (departamentoId === "") return
    const valor = Number(valorStr)
    if (isNaN(valor) || valor < 0) return

    const presId = presentacionActiva.get(productoId) ?? null
    const tipoPres = presId !== null ? presId : undefined
    const clave = claveSalida(productoId, presId, tipoPres)

    setSavingCell({ clave, mes, tipoUnidad: tipoPres })
    try {
      await upsertSalida({
        producto_id: productoId,
        departamento_id: Number(departamentoId),
        presentacion_id: presId,
        cantidad: valor,
        mes,
        anio: year,
        tipo_unidad: tipoPres,
      })

      setSalidasMap(prev => {
        const nuevo = new Map(prev)
        if (!nuevo.has(clave)) nuevo.set(clave, new Map())
        const mesMap = nuevo.get(clave)!
        if (valor === 0) mesMap.delete(mes)
        else mesMap.set(mes, valor)
        return nuevo
      })

      cachedDeptYearRef.current = { dept: Number(departamentoId), year }
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    } finally {
      setSavingCell(null)
    }
  }, [departamentoId, year, presentacionActiva, toast])

  // ─── Eliminar producto ────────────────────────────────────────────────────

  async function handleDeleteProduct(producto: ProductoAlmacen) {
    const ok = await confirm(
      `¿Eliminar el producto "${producto.referencia}"?`,
      { confirmLabel: "Eliminar", danger: true, detail: "Se borrarán también todos los registros de salida y presentaciones asociados." }
    )
    if (!ok) return
    try {
      await deleteProduct(producto.id)
      setProductos(prev => prev.filter(p => p.id !== producto.id))
      setSalidasMap(prev => {
        const nuevo = new Map(prev)
        // Limpiar todas las claves de este producto
        for (const k of [...nuevo.keys()]) {
          if (k.startsWith(`${producto.id}_`)) nuevo.delete(k)
        }
        return nuevo
      })
      setPresentacionesPorProducto(prev => {
        const nuevo = new Map(prev)
        nuevo.delete(producto.id)
        return nuevo
      })
      cachedDeptYearRef.current = { dept: Number(departamentoId), year }
      toast.success("Producto eliminado")
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    }
  }

  // ─── Gestión de presentaciones ────────────────────────────────────────────

  function abrirModalPresentacion(productoId: number) {
    setPresModalProductoId(productoId)
    setPresModalUnidadId("")
    setPresModalPrecio("")
    setShowPresModal(true)
  }

  async function handleGuardarPresentacion() {
    if (presModalProductoId == null || presModalUnidadId === "") return
    const precio = presModalPrecio.trim() !== "" ? parseFloat(presModalPrecio.replace(",", ".")) : null
    if (precio !== null && isNaN(precio)) {
      toast.error("Error", "El precio no es un número válido")
      return
    }
    try {
      const presId = await upsertPresentacion(presModalProductoId, Number(presModalUnidadId), precio)

      // Refrescar presentaciones del producto
      const nuevaLista: ProductoPresentacion[] = [
        ...(presentacionesPorProducto.get(presModalProductoId) ?? []).filter(p => p.unidad_id !== Number(presModalUnidadId)),
        {
          id: presId,
          producto_id: presModalProductoId,
          unidad_id: Number(presModalUnidadId),
          nombre: unidadesPresentacion.find(u => u.id === Number(presModalUnidadId))?.nombre ?? "",
          precio,
        }
      ].sort((a, b) => a.nombre.localeCompare(b.nombre))

      setPresentacionesPorProducto(prev => {
        const nuevo = new Map(prev)
        nuevo.set(presModalProductoId!, nuevaLista)
        return nuevo
      })

      // Si el producto no tenía presentación activa, activar esta
      if (!presentacionActiva.has(presModalProductoId) || presentacionActiva.get(presModalProductoId) == null) {
        setPresentacionActiva(prev => {
          const nuevo = new Map(prev)
          nuevo.set(presModalProductoId!, presId)
          return nuevo
        })
      }

      setShowPresModal(false)
      toast.success("Presentación guardada")
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    }
  }

  async function handleEliminarPresentacion(productoId: number, pres: ProductoPresentacion) {
    const ok = await confirm(
      `¿Eliminar la presentación "${pres.nombre}" de este producto?`,
      { confirmLabel: "Eliminar", danger: true, detail: "Solo se puede eliminar si no tiene salidas registradas." }
    )
    if (!ok) return
    try {
      await deletePresentacion(pres.id)
      const nuevaLista = (presentacionesPorProducto.get(productoId) ?? []).filter(p => p.id !== pres.id)
      setPresentacionesPorProducto(prev => {
        const nuevo = new Map(prev)
        nuevo.set(productoId, nuevaLista)
        return nuevo
      })
      // Si era la activa, pasar a la primera disponible o null
      if (presentacionActiva.get(productoId) === pres.id) {
        setPresentacionActiva(prev => {
          const nuevo = new Map(prev)
          nuevo.set(productoId, nuevaLista[0]?.id ?? null)
          return nuevo
        })
      }
      toast.success("Presentación eliminada")
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    }
  }

  async function handleCrearUnidadGlobal() {
    if (!newUnitName.trim()) return
    try {
      const id = await crearUnidadPresentacion(newUnitName.trim())
      const nuevaUnidad: UnidadPresentacion = { id, nombre: newUnitName.trim() }
      setUnidadesPresentacion(prev => [...prev, nuevaUnidad].sort((a, b) => a.nombre.localeCompare(b.nombre)))
      setNewUnitName("")
      setShowNewUnitModal(false)
      toast.success("Unidad creada", `"${nuevaUnidad.nombre}" ya está disponible`)
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    }
  }

  // ─── Importación Excel ────────────────────────────────────────────────────

  const handleImportClick = () => fileInputRef.current?.click()

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (departamentoId === "" || departamentoId <= 0) {
      toast.error("Error", "Selecciona un departamento válido antes de importar")
      return
    }
    setIsImporting(true)
    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: "array" })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

      const monthMap: { [key: string]: number } = {
        'ENE': 1, 'ENERO': 1, 'FEB': 2, 'FEBRERO': 2, 'MAR': 3, 'MARZO': 3,
        'ABR': 4, 'ABRIL': 4, 'MAY': 5, 'MAYO': 5, 'JUN': 6, 'JUNIO': 6,
        'JUL': 7, 'JULIO': 7, 'AGO': 8, 'AGOSTO': 8,
        'SET': 9, 'SEP': 9, 'SEPTIEMBRE': 9,
        'OCT': 10, 'OCTUBRE': 10, 'NOV': 11, 'NOVIEMBRE': 11, 'DIC': 12, 'DICIEMBRE': 12,
      }
      const monthNames = Object.keys(monthMap)

      let headerRowIndex = -1
      for (let i = 0; i < Math.min(10, data.length); i++) {
        const rowStr = (data[i] as any[]).map(c => String(c || '')).join(' ').toUpperCase()
        if (monthNames.some(m => rowStr.includes(m))) { headerRowIndex = i; break }
      }
      if (headerRowIndex === -1) throw new Error("No se encontró encabezado con meses en el archivo")

      const headerRow = data[headerRowIndex] as any[]
      const detectedMonths: { idx: number; month: number }[] = []
      headerRow.forEach((col: any, idx: number) => {
        const colStr = String(col || '').toUpperCase().trim()
        for (const [name, monthNum] of Object.entries(monthMap)) {
          if (colStr.includes(name)) { detectedMonths.push({ idx, month: monthNum }); break }
        }
      })
      if (detectedMonths.length === 0) throw new Error("No se detectaron columnas de meses")

      let currentCategory = "SIN CATEGORÍA"
      const productosExcel: any[] = []

      for (let i = headerRowIndex + 1; i < data.length; i++) {
        const row = data[i] as any[]
        if (!row || row.length === 0) continue
        const refStr = (row[0] ?? '').toString().trim()
        const descStr = (row[1] ?? '').toString().trim()
        if (refStr !== '' && descStr === '') { currentCategory = refStr; continue }
        if (refStr === '') continue

        const prod: any = { referencia: refStr, nombre: descStr, categoria_nombre: currentCategory, unidad_medida: "UNIDAD", meses: {} }
        for (const { idx, month } of detectedMonths) {
          const val = row[idx]
          if (val != null) {
            const num = parseInt(String(val).trim().split(' ')[0], 10)
            if (!isNaN(num) && num > 0) prod.meses[month] = num
          }
        }
        productosExcel.push(prod)
      }

      if (productosExcel.length === 0) throw new Error("No se encontraron productos para importar")

      let importedCount = 0
      for (let i = 0; i < productosExcel.length; i++) {
        const prod = productosExcel[i]
        try {
          const catId = await getOrCreateCategoriaId(prod.categoria_nombre || "SIN CATEGORÍA")
          const productoId = await ensureProduct(prod.referencia, prod.nombre, catId, prod.unidad_medida || "UNIDAD")
          for (const [mes, cantidad] of Object.entries(prod.meses)) {
            await upsertSalida({
              producto_id: productoId,
              departamento_id: departamentoId as number,
              cantidad: cantidad as number,
              mes: Number(mes),
              anio: year,
            })
          }
          importedCount++
        } catch { importedCount++ }
        if ((i + 1) % 10 === 0 && i < productosExcel.length - 1) {
          await new Promise(r => setTimeout(r, 150))
        }
      }

      toast.success("Importación completada", `Se importaron ${importedCount} productos`)
      await loadInitialData()
      cachedDeptYearRef.current = null
      await cargarSalidas()
    } catch (err: any) {
      toast.error("Error importando archivo", err.message || String(err))
    } finally {
      setIsImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  // ─── Filtrado y agrupación ────────────────────────────────────────────────

  const productosFiltrados = useMemo(() => {
    if (!searchTerm.trim()) return productos
    const term = searchTerm.toLowerCase()
    return productos.filter(p =>
      p.referencia.toLowerCase().includes(term) ||
      p.nombre.toLowerCase().includes(term)
    )
  }, [productos, searchTerm])

  const productosPorCategoria = useMemo(() => {
    const mapa = new Map<number, ProductoAlmacen[]>()
    for (const prod of productosFiltrados) {
      if (!mapa.has(prod.categoria_id)) mapa.set(prod.categoria_id, [])
      mapa.get(prod.categoria_id)!.push(prod)
    }
    return mapa
  }, [productosFiltrados])

  const toggleCategory = (catId: number) => {
    const nuevo = new Set(expandedCategories)
    if (nuevo.has(catId)) nuevo.delete(catId)
    else nuevo.add(catId)
    setExpandedCategories(nuevo)
  }

  const totalesPorMes = useMemo(() => {
    const totals = new Array(12).fill(0)
    for (const prod of productosFiltrados) {
      for (let mes = 1; mes <= 12; mes++) {
        totals[mes - 1] += getConsumo(prod.id, mes)
      }
    }
    return totals
  }, [productosFiltrados, salidasMap, presentacionActiva])

  const maxConsumo = useMemo(() => {
    let max = 0
    for (const prod of productosFiltrados) {
      for (let mes = 1; mes <= 12; mes++) {
        max = Math.max(max, getConsumo(prod.id, mes))
      }
    }
    return max
  }, [productosFiltrados, salidasMap, presentacionActiva])

  if (loading) {
    return <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>Cargando datos...</div>
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 64px)" }}>
      <input type="file" ref={fileInputRef} style={{ display: "none" }} accept=".xlsx,.xls,.csv" onChange={handleFileSelected} />

      {/* ── Barra de controles ── */}
      <div style={{
        backgroundColor: "#fff", border: "1px solid #f1f5f9", borderRadius: "16px",
        padding: "16px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", marginBottom: "16px",
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
                padding: "10px 14px", border: "1.5px solid #e2e8f0", borderRadius: "10px",
                fontSize: "14px", minWidth: "260px", backgroundColor: "#fff", outline: "none", color: "#334155",
              }}
            />

            {/* Selector departamento */}
            <select
              value={departamentoId === "" ? "__todos__" : departamentoId}
              onChange={e => {
                const v = e.target.value
                if (v === "__nuevo__") setShowNewDeptInput(true)
                else if (v === "__todos__") setDepartamentoId("")
                else setDepartamentoId(Number(v))
              }}
              style={{
                padding: "10px 14px", border: "2px solid #e5e7eb", borderRadius: "10px",
                backgroundColor: "#fff", minWidth: "260px", fontSize: "14px", cursor: "pointer",
              }}
            >
              <option value="__todos__">Todos los departamentos</option>
              {departamentos.map(dep => <option key={dep.id} value={dep.id}>{dep.nombre}</option>)}
              <option value="__nuevo__">+ Crear departamento...</option>
            </select>

            {showNewDeptInput && (
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  type="text"
                  placeholder="Nombre del departamento..."
                  value={newDeptName}
                  onChange={e => setNewDeptName(e.target.value)}
                  style={{ padding: "10px 14px", border: "1.5px solid #e2e8f0", borderRadius: "10px", fontSize: "14px" }}
                />
                <button
                  onClick={async () => {
                    if (!newDeptName.trim()) return
                    try {
                      const deptId = await crearDepartamentoProd(newDeptName.trim())
                      setDepartamentos([...departamentos, { id: deptId, nombre: newDeptName.trim() }])
                      setDepartamentoId(deptId)
                      setShowNewDeptInput(false)
                      setNewDeptName("")
                      if (onDepartamentoCreado) onDepartamentoCreado()
                    } catch (e: any) {
                      toast.error("Error", e?.message ?? "Error al crear departamento")
                    }
                  }}
                  style={{ padding: "10px 16px", border: "none", borderRadius: "10px", backgroundColor: "#16a34a", color: "#fff", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}
                >Crear</button>
              </div>
            )}

            {/* Selector año */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <label style={{ fontSize: "14px", color: "#666" }}>Año:</label>
              <select
                value={year}
                onChange={e => setYear(Number(e.target.value))}
                style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "14px" }}
              >
                {availableYears.length > 0
                  ? availableYears.map(y => <option key={y} value={y}>{y}</option>)
                  : <option value={year}>{year}</option>}
              </select>
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              onClick={handleImportClick}
              disabled={isImporting}
              style={{ padding: "10px 16px", border: "1.5px solid #e2e8f0", borderRadius: "10px", backgroundColor: "#fff", fontSize: "13px", fontWeight: 500, cursor: isImporting ? "not-allowed" : "pointer", color: "#475569", opacity: isImporting ? 0.5 : 1 }}
            >{isImporting ? "Importando..." : "📥 Importar Excel"}</button>

            <button
              onClick={() => setShowSalidaModal(true)}
              style={{ padding: "10px 20px", border: "none", borderRadius: "10px", backgroundColor: "#f97316", color: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
            >+ Nueva Salida</button>

            <button
              onClick={() => setShowNewUnitModal(true)}
              style={{ padding: "10px 16px", border: "1.5px solid #6366f1", borderRadius: "10px", backgroundColor: "#fff", color: "#6366f1", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
              title="Gestionar tipos de unidad disponibles"
            >📦 Nueva unidad</button>

            <button
              onClick={() => setEditingProductId("nuevo" as any)}
              style={{ padding: "10px 20px", border: "none", borderRadius: "10px", backgroundColor: "#16a34a", color: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
            >+ Nuevo producto</button>
          </div>
        </div>
      </div>

      {/* ── Tabla / Placeholder ── */}
      {departamentoId === "" ? (
        <div style={{ padding: "60px", textAlign: "center", color: "#6b7280", backgroundColor: "#fff", border: "2px dashed #e5e7eb", borderRadius: "16px", flex: 1 }}>
          <div style={{ fontSize: "18px", fontWeight: 600, marginBottom: "12px" }}>📊 Selecciona un departamento</div>
          <div style={{ fontSize: "14px" }}>Elige un departamento del menú desplegable para ver y editar los consumos mensuales.</div>
        </div>
      ) : (
        <div style={{ backgroundColor: "#fff", border: "2px solid #e5e7eb", borderRadius: "16px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)", overflowY: "auto", flex: 1, minHeight: 0 }}>
          <div style={{ overflowX: "auto", overflowY: "visible", transform: "rotateX(180deg)" }}>
          <div style={{ transform: "rotateX(180deg)" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: "13px", whiteSpace: "nowrap" }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
              <tr>
                <th style={{ ...thStyle, position: "sticky", left: 0, zIndex: 3, minWidth: "110px", boxShadow: "2px 0 4px -2px rgba(0,0,0,0.15)" }}>Referencia</th>
                <th style={{ ...thStyle, position: "sticky", left: "110px", zIndex: 2, minWidth: "220px", boxShadow: "2px 0 4px -2px rgba(0,0,0,0.1)" }}>Nombre</th>
                <th style={{ ...thStyle, minWidth: "100px" }}>Precio (€)</th>
                <th style={{ ...thStyle, minWidth: "120px" }}>Categoría</th>
                <th style={{ ...thStyle, minWidth: "140px" }}>Presentación</th>
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
                      style={{ backgroundColor: isExpanded ? "#eff6ff" : "#f8fafc", cursor: "pointer", borderBottom: "1px solid #f1f5f9" }}
                      onClick={() => toggleCategory(cat.id)}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#eff6ff" }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = isExpanded ? "#eff6ff" : "#f8fafc" }}
                    >
                      <td colSpan={TOTAL_COLS} style={{ padding: "10px 16px", fontWeight: 700, color: "#1e40af", position: "sticky", left: 0, backgroundColor: isExpanded ? "#eff6ff" : "#f8fafc", zIndex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "12px", transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s", color: "#3b82f6" }}>▶</span>
                          <span style={{ fontSize: "13px" }}>{cat.nombre}</span>
                          <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "10px", backgroundColor: isExpanded ? "#dbeafe" : "#e2e8f0", color: isExpanded ? "#2563eb" : "#64748b", fontWeight: 600 }}>{prodsEnCat.length}</span>
                        </div>
                      </td>
                    </tr>

                    {/* Filas de productos */}
                    {isExpanded && prodsEnCat.map(prod => {
                      const totalProd = MESES.reduce((sum, _, idx) => sum + getConsumo(prod.id, idx + 1), 0)
                      const presActiva = getPresActiva(prod.id)
                      const listaPresProducto = presentacionesPorProducto.get(prod.id) ?? []

                      return (
                        <tr
                          key={prod.id}
                          style={{ borderBottom: "1px solid #f1f5f9", backgroundColor: prod.activo === false ? "#fafafa" : "#fff" }}
                          onMouseEnter={e => { if (prod.activo !== false) e.currentTarget.style.backgroundColor = "#f8fafc" }}
                          onMouseLeave={e => { if (prod.activo !== false) e.currentTarget.style.backgroundColor = "#fff" }}
                        >
                          {/* Referencia */}
                          <td style={{ ...tdStyle, position: "sticky", left: 0, zIndex: 3, backgroundColor: "#fff", boxShadow: "2px 0 4px -2px rgba(0,0,0,0.12)" }}>
                            <div style={{ fontWeight: 700, color: prod.activo === false ? "#9ca3af" : "#1d4ed8", fontSize: "13px", display: "flex", alignItems: "center", gap: "6px" }}>
                              {prod.referencia}
                              {prod.activo === false && (
                                <span style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "4px", backgroundColor: "#f3f4f6", color: "#6b7280", border: "1px solid #e5e7eb" }}>INACTIVO</span>
                              )}
                            </div>
                          </td>

                          {/* Nombre */}
                          <td style={{ ...tdStyle, position: "sticky", left: "110px", zIndex: 2, backgroundColor: "#fff", boxShadow: "2px 0 4px -2px rgba(0,0,0,0.08)" }}>
                            <div style={{ fontSize: "13px", color: prod.activo === false ? "#9ca3af" : "#1f2937", fontWeight: prod.activo === false ? 400 : 500 }}>
                              {prod.nombre}
                            </div>
                          </td>

                          {/* Precio de la presentación activa */}
                          <td style={{ ...tdStyle, textAlign: "right", fontSize: "13px" }}>
                            {presActiva?.precio != null
                              ? <span style={{ fontWeight: 600, color: "#059669" }}>
                                  {presActiva.precio.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                                </span>
                              : <span style={{ color: "#9ca3af" }}>—</span>}
                          </td>

                          {/* Categoría */}
                          <td style={{ ...tdStyle }}>{prod.categoria_nombre || "—"}</td>

                          {/* Selector de presentación */}
                          <td style={{ ...tdStyle, minWidth: "160px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                              {listaPresProducto.length === 0 ? (
                                <button
                                  onClick={() => abrirModalPresentacion(prod.id)}
                                  style={{ fontSize: "11px", padding: "3px 8px", border: "1px dashed #6366f1", borderRadius: "4px", backgroundColor: "#ede9fe", color: "#6366f1", cursor: "pointer" }}
                                >+ Añadir presentación</button>
                              ) : (
                                <>
                                  <select
                                    value={presentacionActiva.get(prod.id) ?? ""}
                                    onChange={e => {
                                      const v = Number(e.target.value)
                                      setPresentacionActiva(prev => { const n = new Map(prev); n.set(prod.id, v); return n })
                                    }}
                                    style={{ padding: "3px 6px", border: "1px solid #d1d5db", borderRadius: "4px", fontSize: "12px", minWidth: "90px", maxWidth: "110px" }}
                                  >
                                    {listaPresProducto.map(p => (
                                      <option key={p.id} value={p.id}>
                                        {p.nombre}{p.precio != null ? ` (${p.precio.toLocaleString("es-ES", { minimumFractionDigits: 2 })} €)` : ""}
                                      </option>
                                    ))}
                                  </select>
                                  {/* Botón editar/añadir presentación */}
                                  <button
                                    onClick={() => abrirModalPresentacion(prod.id)}
                                    title="Añadir o editar presentación"
                                    style={{ fontSize: "13px", padding: "2px 5px", border: "1px solid #e5e7eb", borderRadius: "4px", backgroundColor: "#fff", cursor: "pointer", color: "#6366f1" }}
                                  >＋</button>
                                  {/* Botón eliminar presentación activa */}
                                  {presActiva && (
                                    <button
                                      onClick={() => handleEliminarPresentacion(prod.id, presActiva)}
                                      title="Eliminar presentación seleccionada"
                                      style={{ fontSize: "13px", padding: "2px 5px", border: "1px solid #fca5a5", borderRadius: "4px", backgroundColor: "#fff", cursor: "pointer", color: "#dc2626" }}
                                    >✕</button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>

                          {/* Celdas de meses */}
                          {MESES.map((_, idx) => {
                            const mes = idx + 1
                            const presId = presentacionActiva.get(prod.id) ?? null
                            const clave = claveSalida(prod.id, presId)
                            const valor = getConsumo(prod.id, mes)
                            const isSaving = savingCell?.clave === clave && savingCell?.mes === mes
                            const bgColor = listaPresProducto.length === 0
                              ? "#fafafa"
                              : getConsumoColor(valor, maxConsumo)
                            const textColor = getConsumoTextColor(valor)
                            const sinPresentacion = listaPresProducto.length === 0

                            return (
                              <td key={mes} style={{ padding: "4px", textAlign: "center", backgroundColor: bgColor }}>
                                <input
                                  type="number"
                                  min="0"
                                  value={valor}
                                  onChange={e => handleCellChange(prod.id, mes, e.target.value)}
                                  disabled={isSaving || sinPresentacion}
                                  title={sinPresentacion ? "Añade una presentación primero" : undefined}
                                  style={{
                                    width: "60px", padding: "4px", border: "1px solid #d1d5db", borderRadius: "4px",
                                    textAlign: "center", fontSize: "12px",
                                    backgroundColor: (isSaving || sinPresentacion) ? "#f5f5f5" : "rgba(255,255,255,0.92)",
                                    color: sinPresentacion ? "#d1d5db" : textColor,
                                    fontWeight: valor > 0 ? 600 : 400,
                                    cursor: sinPresentacion ? "not-allowed" : "pointer",
                                    outline: "none",
                                    boxShadow: valor > 0 ? "0 0 0 1px rgba(34,197,94,0.25)" : "none",
                                    borderColor: valor > 0 ? "#93c5fd" : "#d1d5db",
                                  }}
                                  onMouseEnter={e => {
                                    if (!isSaving && !sinPresentacion) {
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

                          {/* Total */}
                          <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, fontSize: "13px", color: "#059669", backgroundColor: totalProd > 0 ? "#ecfdf5" : "transparent" }}>
                            {totalProd.toLocaleString()}
                          </td>

                          {/* Acciones */}
                          <td style={{ ...tdStyle, position: "sticky", right: 0, zIndex: 3, backgroundColor: "#fff", boxShadow: "-2px 0 4px -2px rgba(0,0,0,0.12)" }}>
                            <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
                              <button
                                onClick={() => setEditingProductId(prod.id)}
                                style={{ padding: "4px 10px", border: "1px solid #e5e7eb", borderRadius: "6px", backgroundColor: "#fff", fontSize: "12px", cursor: "pointer", color: "#444" }}
                              >Editar</button>
                              <button
                                onClick={() => handleDeleteProduct(prod)}
                                style={{ padding: "4px 10px", border: "1px solid #fca5a5", borderRadius: "6px", backgroundColor: "#fff", fontSize: "12px", cursor: "pointer", color: "#dc2626" }}
                              >Eliminar</button>
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
                    <td key={i} style={{ padding: "14px", textAlign: "center", color: "#fbbf24", fontSize: "14px" }}>{total.toLocaleString()}</td>
                  ))}
                  <td style={{ padding: "14px", textAlign: "right", color: "#fbbf24", fontSize: "14px" }}>
                    {totalesPorMes.reduce((a, b) => a + b, 0).toLocaleString()}
                  </td>
                  <td></td>
                </tr>
              )}

              {productosFiltrados.length === 0 && (
                <tr>
                  <td colSpan={TOTAL_COLS} style={{ padding: "60px", textAlign: "center", color: "#6b7280", backgroundColor: "#fafafa" }}>
                    <div style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>No se encontraron productos</div>
                    <div style={{ fontSize: "13px" }}>{searchTerm ? "Intenta con otro término de búsqueda" : "Agrega productos usando el botón '+ Nuevo producto'"}</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
          </div>
        </div>
      )}

      {dialog}

      {/* ── Modal: Editar producto ── */}
      {editingProductId !== null && (
        <ModalProducto
          producto={editingProductId === ("nuevo" as any) ? null : productos.find(p => p.id === editingProductId) || null}
          onClose={() => setEditingProductId(null)}
          onSaved={async () => {
            await loadInitialData()
            cachedDeptYearRef.current = null
            await cargarSalidas()
            setEditingProductId(null)
          }}
          categorias={categorias}
        />
      )}

      {/* ── Modal: Nueva salida ── */}
{showSalidaModal && (
  <ModalSalida
    onClose={() => setShowSalidaModal(false)}
    onSaved={({ productoId, presentacionId, cantidad, mes, anio: anioGuardado }) => {
      if (anioGuardado !== year) return
      const clave = claveSalida(productoId, presentacionId, presentacionId)
      setSalidasMap(prev => {
        const nuevo = new Map(prev)
        if (!nuevo.has(clave)) nuevo.set(clave, new Map())
        const mesMap = nuevo.get(clave)!
        if (cantidad === 0) mesMap.delete(mes)
        else mesMap.set(mes, cantidad)
        return nuevo
      })
      cachedDeptYearRef.current = { dept: Number(departamentoId), year }
    }}
  />
)}

      {/* ── Modal: Añadir/editar presentación a producto ── */}
      {showPresModal && presModalProductoId !== null && (() => {
        const prod = productos.find(p => p.id === presModalProductoId)
        const listaExistente = presentacionesPorProducto.get(presModalProductoId) ?? []
        const unidadesDisponibles = unidadesPresentacion.filter(
          u => !listaExistente.some(e => e.unidad_id === u.id)
        )
        return (
          <div onClick={() => setShowPresModal(false)} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.35)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div onClick={e => e.stopPropagation()} style={{ backgroundColor: "#fff", borderRadius: "14px", width: "400px", maxWidth: "calc(100vw - 32px)", boxShadow: "0 20px 48px rgba(0,0,0,0.15)", overflow: "hidden" }}>
              <div style={{ height: "4px", backgroundColor: "#6366f1" }} />
              <div style={{ padding: "24px" }}>
                <h2 style={{ fontSize: "15px", fontWeight: 700, margin: "0 0 6px" }}>Añadir presentación</h2>
                <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 20px" }}>
                  {prod?.referencia} — {prod?.nombre}
                </p>

                {/* Presentaciones existentes */}
                {listaExistente.length > 0 && (
                  <div style={{ marginBottom: "20px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
                      Presentaciones configuradas
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {listaExistente.map(p => (
                        <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", backgroundColor: "#f8fafc", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                          <span style={{ fontSize: "13px", fontWeight: 500 }}>{p.nombre}</span>
                          <span style={{ fontSize: "13px", color: "#059669", fontWeight: 600 }}>
                            {p.precio != null ? `${p.precio.toLocaleString("es-ES", { minimumFractionDigits: 2 })} €` : "sin precio"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Selector unidad */}
                <div style={{ marginBottom: "14px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", display: "block", marginBottom: "6px" }}>Tipo de unidad</label>
                  {unidadesDisponibles.length === 0 ? (
                    <div style={{ fontSize: "13px", color: "#64748b", padding: "10px", backgroundColor: "#f1f5f9", borderRadius: "6px" }}>
                      Todas las unidades ya están asignadas a este producto.{" "}
                      <span
                        onClick={() => { setShowPresModal(false); setShowNewUnitModal(true) }}
                        style={{ color: "#6366f1", cursor: "pointer", fontWeight: 600 }}
                      >Crear nueva unidad →</span>
                    </div>
                  ) : (
                    <select
                      value={presModalUnidadId}
                      onChange={e => setPresModalUnidadId(Number(e.target.value) as any)}
                      style={{ width: "100%", padding: "10px", border: "1.5px solid #e2e8f0", borderRadius: "8px", fontSize: "14px" }}
                    >
                      <option value="">Seleccionar...</option>
                      {unidadesDisponibles.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                    </select>
                  )}
                </div>

                {/* Precio */}
                <div style={{ marginBottom: "20px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", display: "block", marginBottom: "6px" }}>Precio (€) — opcional</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={presModalPrecio}
                    onChange={e => setPresModalPrecio(e.target.value)}
                    placeholder="Ej: 12,50"
                    style={{ width: "100%", padding: "10px 14px", border: "1.5px solid #e2e8f0", borderRadius: "8px", fontSize: "14px", boxSizing: "border-box" }}
                  />
                </div>

                <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                  <button
                    onClick={() => setShowPresModal(false)}
                    style={{ padding: "8px 16px", borderRadius: "6px", border: "1px solid #d1d5db", backgroundColor: "#fff", color: "#666", cursor: "pointer" }}
                  >Cancelar</button>
                  <button
                    onClick={handleGuardarPresentacion}
                    disabled={presModalUnidadId === ""}
                    style={{ padding: "8px 20px", borderRadius: "6px", border: "none", backgroundColor: presModalUnidadId === "" ? "#a5b4fc" : "#6366f1", color: "#fff", fontWeight: 600, cursor: presModalUnidadId === "" ? "not-allowed" : "pointer" }}
                  >Guardar</button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Modal: Nueva unidad global ── */}
      {showNewUnitModal && (
        <div onClick={() => setShowNewUnitModal(false)} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.35)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: "#fff", borderRadius: "14px", width: "360px", maxWidth: "calc(100vw - 32px)", boxShadow: "0 20px 48px rgba(0,0,0,0.15)", overflow: "hidden" }}>
            <div style={{ height: "4px", backgroundColor: "#6366f1" }} />
            <div style={{ padding: "24px" }}>
              <h2 style={{ fontSize: "15px", fontWeight: 700, margin: "0 0 6px" }}>Nueva unidad de presentación</h2>
              <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 20px" }}>
                Esta unidad estará disponible para asignar a cualquier producto (p.ej. Litro, Garrafa 5L, Spray, Pastilla…)
              </p>
              <div style={{ marginBottom: "20px" }}>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", display: "block", marginBottom: "6px" }}>Nombre</label>
                <input
                  type="text"
                  value={newUnitName}
                  onChange={e => setNewUnitName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleCrearUnidadGlobal() }}
                  placeholder="Ej: Garrafa 5L"
                  style={{ width: "100%", padding: "10px 14px", border: "1.5px solid #e2e8f0", borderRadius: "8px", fontSize: "14px", boxSizing: "border-box" }}
                />
              </div>
              {/* Lista de unidades ya existentes */}
              {unidadesPresentacion.length > 0 && (
                <div style={{ marginBottom: "16px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
                    Unidades existentes
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {unidadesPresentacion.map(u => (
                      <span key={u.id} style={{ fontSize: "12px", padding: "3px 8px", borderRadius: "20px", backgroundColor: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0" }}>
                        {u.nombre}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button onClick={() => { setShowNewUnitModal(false); setNewUnitName("") }} style={{ padding: "8px 16px", borderRadius: "6px", border: "1px solid #d1d5db", backgroundColor: "#fff", color: "#666", cursor: "pointer" }}>Cancelar</button>
                <button
                  onClick={handleCrearUnidadGlobal}
                  disabled={!newUnitName.trim()}
                  style={{ padding: "8px 20px", borderRadius: "6px", border: "none", backgroundColor: newUnitName.trim() ? "#6366f1" : "#a5b4fc", color: "#fff", fontWeight: 600, cursor: newUnitName.trim() ? "pointer" : "not-allowed" }}
                >Crear</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Estilos reutilizables ────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  padding: "12px 16px",
  textAlign: "left",
  backgroundColor: "#f8fafc",
  borderBottom: "2px solid #e2e8f0",
  fontWeight: 700,
  color: "#64748b",
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
