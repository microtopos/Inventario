import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from "react"
import { useConfirm } from "./ConfirmDialog"
import { useToast } from "./Toast"
import {
  getCategorias,
  getProductos,
  getDepartamentosProd,
  deleteProduct,
  upsertSalida,
  upsertStock,
  getStockPorPresentacion,
  crearDepartamentoProd,
  getSalidasByYear,
  getAniosDisponibles,
  getUnidadesPresentacion,
  getAllPresentaciones,
  upsertPresentacion,
  deletePresentacion,
  crearUnidadPresentacion,
  actualizarUnidadPresentacion,
  actualizarDepartamentoProd,
  eliminarDepartamentoProd,
  eliminarUnidadPresentacion,
  crearCategoria,
  actualizarCategoria,
  eliminarCategoria,
  claveSalida,
  exportarProductosJSON,
  importarProductosJSON,
  eliminarSalidasDepartamento,
  type CategoriaProducto,
  type ProductoAlmacen,
  type DepartamentoProd,
  type UnidadPresentacion,
  type ProductoPresentacion,
  type ExportacionProductos,
} from "./productosService"
import { ModalProducto } from "./ProductModal"
import { ModalSalida } from "./SalidaModal"


const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
]

const MESES_CORTOS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"
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

// Ref + Nombre + Presentación + Precio + Categoría + Stock + meses visibles + Total + Acciones
// TOTAL_COLS es dinámico: 6 columnas fijas + mesesVisibles.length + Total + Acciones = 8 + mesesVisibles.length

// ─── Componente principal ────────────────────────────────────────────────────

export default function VistaCatalogoMejorada({ onDepartamentoCreado }: { onDepartamentoCreado?: () => void }) {
  const toast = useToast()
  const { confirm, dialog } = useConfirm()

  // ── Modales ──
  const [showSalidaModal, setShowSalidaModal] = useState(false)
  const [editingProductId, setEditingProductId] = useState<number | "nuevo" | null>(null)

  // Modal añadir presentación a un producto
  const [showPresModal, setShowPresModal] = useState(false)
  const [presModalProductoId, setPresModalProductoId] = useState<number | null>(null)
  const [presModalUnidadId, setPresModalUnidadId] = useState<number | "">("")
  const [presModalPrecio, setPresModalPrecio] = useState("")
  // Modal nueva unidad global — ahora integrado en Gestionar

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
  const [mesesFiltro, setMesesFiltro] = useState<Set<number>>(new Set()) // vacío = todos

  // ── Presentación activa por producto (qué fila se muestra) ──
  // producto_id → presentacion_id (null = "sin presentación")
  const [presentacionActiva, setPresentacionActiva] = useState<Map<number, number | null>>(new Map())

  // ── Salidas: mapa "productoId_presentacionId" → mes → cantidad ──
  const [salidasMap, setSalidasMap] = useState<Map<string, Map<number, number>>>(new Map())

  // ── Stock por (producto_id, presentacion_id) ──
  // clave: "productoId_presentacionId"
  const [stockMap, setStockMap] = useState<Map<string, number | null>>(new Map())

  // ── UI helpers ──
  const [wideNombre, setWideNombre] = useState(false)
  const [savingStock, setSavingStock] = useState<string | null>(null) // clave "productoId_presId" guardando
  const [loading, setLoading] = useState(true)
  const [savingCell, setSavingCell] = useState<{ clave: string; mes: number; tipoUnidad: string | null } | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  // Modal Gestionar (departamentos + unidades)
  const [showGestionarModal, setShowGestionarModal] = useState(false)
  const [gestionarTab, setGestionarTab] = useState<"departamentos" | "unidades" | "productos" | "categorias">("departamentos")
  const [newDeptName, setNewDeptName] = useState("")
  const [newUnitNameGlobal, setNewUnitNameGlobal] = useState("")
  const [gestionarDropdownOpen, setGestionarDropdownOpen] = useState(false)
  // Estado de edición inline en modal Gestionar
  const [editingDeptId, setEditingDeptId] = useState<number | null>(null)
  const [editingDeptName, setEditingDeptName] = useState("")
  const [editingUnitId, setEditingUnitId] = useState<number | null>(null)
  const [editingUnitName, setEditingUnitName] = useState("")
  const [editingCatId, setEditingCatId] = useState<number | null>(null)
  const [editingCatName, setEditingCatName] = useState("")
  const [newCatName, setNewCatName] = useState("")
  const [gestionarProductoSearch, setGestionarProductoSearch] = useState("")
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const departamentoIdRef = useRef<number | "" | undefined>(undefined)
  useEffect(() => { departamentoIdRef.current = departamentoId }, [departamentoId])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const toastRef = useRef(toast)
  useEffect(() => { toastRef.current = toast })
  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    if (!gestionarDropdownOpen) return
    const handler = () => setGestionarDropdownOpen(false)
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [gestionarDropdownOpen])

  // ─── Carga inicial ────────────────────────────────────────────────────────

  const loadInitialData = useCallback(async () => {
    setLoading(true)
    try {
      const [cats, prods, depts, anios, unidades, todasPresentaciones, stockInicial] = await Promise.all([
        getCategorias(),
        getProductos(false),
        getDepartamentosProd(),
        getAniosDisponibles(),
        getUnidadesPresentacion(),
        getAllPresentaciones(),
        getStockPorPresentacion(),
      ])
      setCategorias(cats)
      setProductos(prods)
      setDepartamentos(depts)
      setAvailableYears(anios)
      setUnidadesPresentacion(unidades)
      setPresentacionesPorProducto(todasPresentaciones)
      setExpandedCategories(new Set(cats.map(c => c.id)))
      setStockMap(stockInicial)

      const activaInicial = new Map<number, number | null>()
      for (const prod of prods) {
        const lista = todasPresentaciones.get(prod.id) ?? []
        activaInicial.set(prod.id, lista.length > 0 ? lista[0].id : null)
      }
      setPresentacionActiva(activaInicial)

    } catch (e: any) {
      toastRef.current.error("Error", e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }, []) // sin dependencias → nunca se recrea

  // ─── Carga de salidas ──────────────────────────────────────────────────────

  const cargarSalidas = useCallback(async () => {
    if (departamentoId === "") {
      setSalidasMap(new Map())
      return
    }
    try {
      const mapa = await getSalidasByYear(year, Number(departamentoId))
      setSalidasMap(mapa)
    } catch (e: any) {
      toastRef.current.error("Error", e?.message ?? String(e))
      setSalidasMap(new Map())
    }
  }, [departamentoId, year])

  useEffect(() => { loadInitialData() }, [loadInitialData])

  useEffect(() => { cargarSalidas() }, [departamentoId, year, cargarSalidas])

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
    // tipo_unidad en la BD es unidad_id (FK a unidades_presentacion), no id de producto_presentaciones
    const presObj = presId !== null
      ? (presentacionesPorProducto.get(productoId)?.find(p => p.id === presId) ?? null)
      : null
    const tipoUnidad = presObj !== null ? String(presObj.unidad_id) : null
    const clave = claveSalida(productoId, presId, tipoUnidad)
    return salidasMap.get(clave)?.get(mes) ?? 0
  }

  // ─── Actualizar celda ─────────────────────────────────────────────────────

  const handleCellChange = useCallback(async (
    productoId: number,
    mes: number,
    valorStr: string
  ) => {
    if (departamentoIdRef.current === "") return
    const valor = Number(valorStr)
    if (isNaN(valor) || valor < 0) return

    const presId = presentacionActiva.get(productoId) ?? null
    const presObj = presId !== null
      ? (presentacionesPorProducto.get(productoId)?.find(p => p.id === presId) ?? null)
      : null
    // tipo_unidad debe ser unidad_id (FK a unidades_presentacion), no id de producto_presentaciones
    const tipoUnidad = presObj?.unidad_id ?? null
    const tipoUnidadStr = tipoUnidad !== null ? String(tipoUnidad) : null
    const clave = claveSalida(productoId, presId, tipoUnidadStr)

    setSavingCell({ clave, mes, tipoUnidad: tipoUnidadStr })
    try {
      await upsertSalida({
        producto_id: productoId,
        departamento_id: Number(departamentoIdRef.current),
        presentacion_id: presId,
        cantidad: valor,
        mes,
        anio: year,
        tipo_unidad: tipoUnidad,
      })
  
      setSalidasMap(prev => {
        const nuevo = new Map(prev)
        if (!nuevo.has(clave)) nuevo.set(clave, new Map())
        const mesMap = nuevo.get(clave)!
        if (valor === 0) mesMap.delete(mes)
        else mesMap.set(mes, valor)
        return nuevo
      })
  
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    } finally {
      setSavingCell(null)
    }
  }, [departamentoId, year, presentacionActiva, toast])

  // ─── Actualizar stock ─────────────────────────────────────────────────────

  const handleStockChange = useCallback(async (
    productoId: number,
    presentacionId: number | null,
    valorStr: string
  ) => {
    const valor = valorStr.trim() === "" ? null : Number(valorStr)
    if (valor !== null && (isNaN(valor) || valor < 0)) return
    const clave = `${productoId}_${presentacionId ?? "null"}`
    setSavingStock(clave)
    try {
      await upsertStock(productoId, valor, presentacionId)
      setStockMap(prev => {
        const nuevo = new Map(prev)
        nuevo.set(clave, valor)
        return nuevo
      })
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    } finally {
      setSavingStock(null)
    }
  }, [toast])

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
      setStockMap(prev => {
        const nuevo = new Map(prev)
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
      // Limpiar stock de la presentación eliminada
      setStockMap(prev => {
        const nuevo = new Map(prev)
        nuevo.delete(`${productoId}_${pres.id}`)
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

  async function handleGuardarDepartamento(id: number) {
    if (!editingDeptName.trim()) return
    try {
      await actualizarDepartamentoProd(id, editingDeptName.trim())
      setDepartamentos(prev => prev.map(d => d.id === id ? { ...d, nombre: editingDeptName.trim() } : d))
      setEditingDeptId(null)
      toast.success("Departamento actualizado")
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    }
  }

  async function handleGuardarUnidad(id: number) {
    if (!editingUnitName.trim()) return
    try {
      await actualizarUnidadPresentacion(id, editingUnitName.trim())
      setUnidadesPresentacion(prev => prev.map(u => u.id === id ? { ...u, nombre: editingUnitName.trim() } : u))
      setEditingUnitId(null)
      toast.success("Unidad actualizada")
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    }
  }

  async function handleCrearCategoria() {
    if (!newCatName.trim()) return
    try {
      const id = await crearCategoria(newCatName.trim())
      setCategorias(prev => [...prev, { id, nombre: newCatName.trim() }].sort((a, b) => a.nombre.localeCompare(b.nombre)))
      setNewCatName("")
      toast.success("Categoría creada")
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    }
  }

  async function handleGuardarCategoria(id: number) {
    if (!editingCatName.trim()) return
    try {
      await actualizarCategoria(id, editingCatName.trim())
      setCategorias(prev => prev.map(c => c.id === id ? { ...c, nombre: editingCatName.trim() } : c))
      setEditingCatId(null)
      toast.success("Categoría actualizada")
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    }
  }

  async function handleEliminarCategoria(cat: CategoriaProducto) {
    const ok = await confirm(
      `¿Eliminar la categoría "${cat.nombre}"?`,
      { confirmLabel: "Eliminar", danger: true, detail: "Solo se puede eliminar si no tiene productos activos asignados." }
    )
    if (!ok) return
    try {
      await eliminarCategoria(cat.id)
      setCategorias(prev => prev.filter(c => c.id !== cat.id))
      toast.success("Categoría eliminada")
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    }
  }

  async function handleCrearUnidadGlobal() {
    if (!newUnitNameGlobal.trim()) return
    try {
      const id = await crearUnidadPresentacion(newUnitNameGlobal.trim())
      const nuevaUnidad: UnidadPresentacion = { id, nombre: newUnitNameGlobal.trim() }
      setUnidadesPresentacion(prev => [...prev, nuevaUnidad].sort((a, b) => a.nombre.localeCompare(b.nombre)))
      setNewUnitNameGlobal("")
      toast.success("Unidad creada", `"${nuevaUnidad.nombre}" ya está disponible`)
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    }
  }

  async function handleCrearDepartamento() {
    if (!newDeptName.trim()) return
    try {
      const deptId = await crearDepartamentoProd(newDeptName.trim())
      setDepartamentos(prev => [...prev, { id: deptId, nombre: newDeptName.trim() }])
      setDepartamentoId(deptId)
      setNewDeptName("")
      if (onDepartamentoCreado) onDepartamentoCreado()
      toast.success("Departamento creado")
    } catch (e: any) {
      toast.error("Error", e?.message ?? "Error al crear departamento")
    }
  }

  async function handleEliminarDepartamento(dept: DepartamentoProd) {
    const ok = await confirm(
      `¿Eliminar el departamento "${dept.nombre}"?`,
      { confirmLabel: "Eliminar", danger: true, detail: "Se eliminarán también todos los registros de consumo asociados a este departamento." }
    )
    if (!ok) return
    try {
      await eliminarDepartamentoProd(dept.id)
      setDepartamentos(prev => prev.filter(d => d.id !== dept.id))
      if (departamentoId === dept.id) {
        const remaining = departamentos.filter(d => d.id !== dept.id)
        setDepartamentoId(remaining[0]?.id ?? "")
      }
      toast.success("Departamento eliminado")
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    }
  }

  async function handleEliminarUnidad(unidad: UnidadPresentacion) {
    const ok = await confirm(
      `¿Eliminar la unidad "${unidad.nombre}"?`,
      { confirmLabel: "Eliminar", danger: true, detail: "Solo se puede eliminar si ningún producto la tiene asignada." }
    )
    if (!ok) return
    try {
      await eliminarUnidadPresentacion(unidad.id)
      setUnidadesPresentacion(prev => prev.filter(u => u.id !== unidad.id))
      toast.success("Unidad eliminada")
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    }
  }

  // ─── Limpiar movimientos del departamento ────────────────────────────────

  const handleLimpiarMovimientos = async () => {
    if (departamentoId === "") return
    const deptNombre = departamentos.find(d => d.id === departamentoId)?.nombre ?? ""
    const ok = await confirm(
      `¿Eliminar todos los movimientos de "${deptNombre}" en ${year}?`,
      { confirmLabel: "Eliminar todo", danger: true, detail: "Se borrarán todos los registros de consumo de este departamento para el año seleccionado. Esta acción no se puede deshacer." }
    )
    if (!ok) return
    try {
      const eliminados = await eliminarSalidasDepartamento(Number(departamentoId), year)
      setSalidasMap(new Map())
      toast.success("Movimientos eliminados", `${eliminados} registros eliminados`)
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    }
  }

  // ─── Exportación JSON ─────────────────────────────────────────────────────

  const handleExportJSON = async () => {
    try {
      const datos = await exportarProductosJSON()
      const json = JSON.stringify(datos, null, 2)
      const blob = new Blob([json], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      const fecha = new Date().toISOString().slice(0, 10)
      a.href = url
      a.download = `productos_${fecha}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success("Exportación completada", `${datos.productos.length} productos exportados`)
    } catch (e: any) {
      toast.error("Error exportando", e?.message ?? String(e))
    }
  }

  // ─── Importación JSON ─────────────────────────────────────────────────────

  const handleImportClick = () => fileInputRef.current?.click()

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsImporting(true)
    try {
      const text = await file.text()
      let datos: ExportacionProductos
      try {
        datos = JSON.parse(text)
      } catch {
        throw new Error("El archivo no es un JSON válido.")
      }

      const resultado = await importarProductosJSON(datos)

      const resumen = [
        `${resultado.importados} productos`,
        resultado.departamentosImportados > 0 ? `${resultado.departamentosImportados} departamentos` : null,
        resultado.salidasImportadas > 0 ? `${resultado.salidasImportadas} movimientos` : null,
      ].filter(Boolean).join(", ")

      if (resultado.errores.length > 0) {
        toast.error("Importación con errores", `${resumen}. Errores: ${resultado.errores.slice(0, 3).join(" | ")}`)
      } else {
        toast.success("Importación completada", resumen)
      }

      await loadInitialData()
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

  // Índices de meses visibles (0-11). Si el filtro está vacío, se muestran todos.
  const mesesVisibles = useMemo(() =>
    mesesFiltro.size === 0
      ? MESES.map((_, i) => i)
      : MESES.map((_, i) => i).filter(i => mesesFiltro.has(i))
  , [mesesFiltro])

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
      <input type="file" ref={fileInputRef} style={{ display: "none" }} accept=".json" onChange={handleFileSelected} />

      {/* ── Barra de controles ── */}
      <div style={{
        backgroundColor: "#fff", border: "1px solid #e8edf2", borderRadius: "16px",
        padding: "14px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", marginBottom: "16px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>

          {/* Buscador */}
          <input
            type="text"
            placeholder="🔍 Buscar referencia o nombre..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              flex: 1, minWidth: "180px", height: "40px", padding: "0 14px",
              border: "1.5px solid #e2e8f0", borderRadius: "10px",
              fontSize: "14px", backgroundColor: "#fff", outline: "none", color: "#334155",
            }}
          />

          <div style={{ width: "1px", height: "28px", backgroundColor: "#e2e8f0", flexShrink: 0 }} />

          {/* Selector departamento */}
          <select
            value={departamentoId === "" ? "__todos__" : departamentoId}
            onChange={e => {
              const v = e.target.value
              if (v === "__todos__") setDepartamentoId("")
              else setDepartamentoId(Number(v))
            }}
            style={{
              height: "40px", padding: "0 12px", border: "1.5px solid #e2e8f0", borderRadius: "10px",
              backgroundColor: "#fff", minWidth: "200px", fontSize: "14px", cursor: "pointer", color: "#334155",
            }}
          >
            <option value="__todos__">Todos los departamentos</option>
            {departamentos.map(dep => <option key={dep.id} value={dep.id}>{dep.nombre}</option>)}
          </select>

          {/* Selector año */}
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            style={{
              height: "40px", padding: "0 12px", border: "1.5px solid #e2e8f0", borderRadius: "10px",
              backgroundColor: "#fff", fontSize: "14px", cursor: "pointer", color: "#334155",
            }}
          >
            {availableYears.length > 0
              ? availableYears.map(y => <option key={y} value={y}>{y}</option>)
              : <option value={year}>{year}</option>}
          </select>

          <div style={{ width: "1px", height: "28px", backgroundColor: "#e2e8f0", flexShrink: 0 }} />

          {/* ── Acciones principales ── */}

          {/* + Nueva salida */}
          <button
            onClick={() => setShowSalidaModal(true)}
            style={{
              height: "40px", padding: "0 16px", border: "1.5px solid #3b82f6", borderRadius: "10px",
              backgroundColor: "#fff", color: "#3b82f6", fontSize: "13px", fontWeight: 600,
              cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "5px",
            }}
          >
            <span style={{ fontSize: "15px", lineHeight: 1 }}>+</span> Nueva salida
          </button>

          {/* ⚙ Gestionar (dropdown) */}
          <div style={{ position: "relative" }} onMouseDown={e => e.stopPropagation()}>
            <button
              onClick={() => setGestionarDropdownOpen(v => !v)}
              style={{
                height: "40px", padding: "0 14px", border: "1.5px solid #e2e8f0", borderRadius: "10px",
                backgroundColor: gestionarDropdownOpen ? "#f8fafc" : "#fff", color: "#475569",
                fontSize: "13px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                display: "flex", alignItems: "center", gap: "6px",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              Gestionar
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: gestionarDropdownOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>

            {gestionarDropdownOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 200,
                backgroundColor: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px",
                boxShadow: "0 8px 24px rgba(0,0,0,0.10)", minWidth: "200px", overflow: "hidden",
              }}>
                <div style={{ padding: "6px" }}>
                  <button
                    onClick={() => { setGestionarTab("productos"); setShowGestionarModal(true); setGestionarDropdownOpen(false) }}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", border: "none", backgroundColor: "transparent", borderRadius: "8px", cursor: "pointer", textAlign: "left", fontSize: "13px", color: "#374151", fontWeight: 500 }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#f8fafc" }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent" }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                    </svg>
                    Productos
                  </button>
                  <div style={{ height: "1px", backgroundColor: "#f1f5f9", margin: "4px 6px" }} />
                  <button
                    onClick={() => { setGestionarTab("categorias"); setShowGestionarModal(true); setGestionarDropdownOpen(false) }}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", border: "none", backgroundColor: "transparent", borderRadius: "8px", cursor: "pointer", textAlign: "left", fontSize: "13px", color: "#374151", fontWeight: 500 }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#f8fafc" }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent" }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                    Categorías
                  </button>
                  <div style={{ height: "1px", backgroundColor: "#f1f5f9", margin: "4px 6px" }} />
                  <button
                    onClick={() => { setGestionarTab("departamentos"); setShowGestionarModal(true); setGestionarDropdownOpen(false) }}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", border: "none", backgroundColor: "transparent", borderRadius: "8px", cursor: "pointer", textAlign: "left", fontSize: "13px", color: "#374151", fontWeight: 500 }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#f8fafc" }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent" }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
                    </svg>
                    Departamentos
                  </button>
                  <button
                    onClick={() => { setGestionarTab("unidades"); setShowGestionarModal(true); setGestionarDropdownOpen(false) }}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", border: "none", backgroundColor: "transparent", borderRadius: "8px", cursor: "pointer", textAlign: "left", fontSize: "13px", color: "#374151", fontWeight: 500 }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#f8fafc" }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent" }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
                    </svg>
                    Unidades de presentación
                  </button>

                  {/* ── Sección avanzada ── */}
                  <div style={{ height: "1px", backgroundColor: "#f1f5f9", margin: "4px 6px" }} />
                  <div style={{ padding: "6px 12px 4px", fontSize: "10px", fontWeight: 700, color: "#cbd5e1", textTransform: "uppercase", letterSpacing: "0.08em" }}>Avanzado</div>
                  <button
                    onClick={() => { handleImportClick(); setGestionarDropdownOpen(false) }}
                    disabled={isImporting}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", border: "none", backgroundColor: "transparent", borderRadius: "8px", cursor: isImporting ? "not-allowed" : "pointer", textAlign: "left", fontSize: "13px", color: "#64748b", fontWeight: 400, opacity: isImporting ? 0.5 : 1 }}
                    onMouseEnter={e => { if (!isImporting) e.currentTarget.style.backgroundColor = "#f8fafc" }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent" }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    {isImporting ? "Importando..." : "Importar JSON"}
                  </button>
                  <button
                    onClick={() => { handleExportJSON(); setGestionarDropdownOpen(false) }}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", border: "none", backgroundColor: "transparent", borderRadius: "8px", cursor: "pointer", textAlign: "left", fontSize: "13px", color: "#64748b", fontWeight: 400 }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#f8fafc" }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent" }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Exportar JSON
                  </button>
                  <button
                    onClick={() => { handleLimpiarMovimientos(); setGestionarDropdownOpen(false) }}
                    disabled={departamentoId === ""}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", border: "none", backgroundColor: "transparent", borderRadius: "8px", cursor: departamentoId === "" ? "not-allowed" : "pointer", textAlign: "left", fontSize: "13px", color: departamentoId === "" ? "#cbd5e1" : "#dc2626", fontWeight: 400, opacity: departamentoId === "" ? 0.5 : 1 }}
                    onMouseEnter={e => { if (departamentoId !== "") e.currentTarget.style.backgroundColor = "#fef2f2" }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent" }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={departamentoId === "" ? "#cbd5e1" : "#dc2626"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                    </svg>
                    Limpiar movimientos de {year}
                  </button>
                </div>
              </div>
            )}
          </div>


        </div>

        {/* ── Chips de filtro de meses ── */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #f1f5f9", flexWrap: "wrap" }}>
          <span style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginRight: "2px", whiteSpace: "nowrap" }}>Meses:</span>
          <button
            onClick={() => setMesesFiltro(new Set())}
            style={{
              height: "28px", padding: "0 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600,
              cursor: "pointer", border: "1.5px solid",
              borderColor: mesesFiltro.size === 0 ? "#3b82f6" : "#e2e8f0",
              backgroundColor: mesesFiltro.size === 0 ? "#eff6ff" : "#fff",
              color: mesesFiltro.size === 0 ? "#2563eb" : "#94a3b8",
            }}
          >Todos</button>
          {MESES_CORTOS.map((mes, i) => {
            const activo = mesesFiltro.has(i)
            return (
              <button
                key={i}
                onClick={() => {
                  setMesesFiltro(prev => {
                    const next = new Set(prev)
                    if (next.has(i)) next.delete(i)
                    else next.add(i)
                    return next
                  })
                }}
                style={{
                  height: "28px", padding: "0 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600,
                  cursor: "pointer", border: "1.5px solid", transition: "all 0.1s",
                  borderColor: activo ? "#3b82f6" : "#e2e8f0",
                  backgroundColor: activo ? "#eff6ff" : "#fff",
                  color: activo ? "#2563eb" : "#64748b",
                }}
              >{mes}</button>
            )
          })}
          {mesesFiltro.size > 0 && (
            <span style={{ fontSize: "11px", color: "#94a3b8", marginLeft: "4px" }}>
              {mesesFiltro.size === 1 ? "1 mes seleccionado" : `${mesesFiltro.size} meses seleccionados`}
            </span>
          )}
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
                <th style={{ ...thStyle, width: "90px", minWidth: "90px", maxWidth: "90px" }}><div style={{ padding: "12px 16px" }}>Ref.</div></th>
                <th onClick={() => setWideNombre(w => !w)} style={{ ...thStyle, padding: 0, position: "sticky", left: 0, zIndex: 3, width: wideNombre ? "320px" : "240px", minWidth: wideNombre ? "320px" : "240px", maxWidth: wideNombre ? "320px" : "240px", boxShadow: "none", cursor: "pointer", userSelect: "none", transition: "width 0.2s" }}><div style={{ padding: "12px 16px" }}>Nombre</div></th>
                <th style={{ ...thStyle, padding: 0, position: "sticky", left: wideNombre ? "320px" : "240px", zIndex: 3, width: "170px", minWidth: "170px", boxShadow: "2px 0 4px -2px rgba(0,0,0,0.1)", transition: "left 0.2s" }}><div style={{ padding: "12px 16px" }}>Presentación</div></th>
                <th style={{ ...thStyle, minWidth: "100px" }}>Precio (€)</th>
                <th style={{ ...thStyle, minWidth: "120px" }}>Categoría</th>
                <th style={{ ...thStyle, minWidth: "90px", textAlign: "center" }}>Stock</th>
                {mesesVisibles.map(i => (
                  <th key={i} style={{ ...thStyle, minWidth: "70px", textAlign: "center" }}>{MESES[i]}</th>
                ))}
                <th style={{ ...thStyle, minWidth: "100px", textAlign: "center" }}>Total</th>
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
                      <td colSpan={8 + mesesVisibles.length} style={{ padding: "10px 16px", fontWeight: 700, color: "#1e40af", position: "sticky", left: 0, backgroundColor: isExpanded ? "#eff6ff" : "#f8fafc", zIndex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "12px", transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s", color: "#3b82f6" }}>▶</span>
                          <span style={{ fontSize: "13px" }}>{cat.nombre}</span>
                          <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "10px", backgroundColor: isExpanded ? "#dbeafe" : "#e2e8f0", color: isExpanded ? "#2563eb" : "#64748b", fontWeight: 600 }}>{prodsEnCat.length}</span>
                        </div>
                      </td>
                    </tr>

                    {/* Filas de productos */}
                    {isExpanded && prodsEnCat.map((prod, rowIdx) => {
                      const totalProd = mesesVisibles.reduce((sum, idx) => sum + getConsumo(prod.id, idx + 1), 0)
                      const presActiva = getPresActiva(prod.id)
                      const listaPresProducto = presentacionesPorProducto.get(prod.id) ?? []

                      const isEven = rowIdx % 2 === 0
                      const rowBg = prod.activo === 0 ? "#fafafa" : isEven ? "#fff" : "#f8fafc"
                      const rowBgHover = prod.activo === 0 ? "#fafafa" : "#eef2ff"

                      return (
                        <tr
                          key={prod.id}
                          style={{ borderBottom: "1px solid #f1f5f9", backgroundColor: rowBg }}
                          onMouseEnter={e => { if (prod.activo !== 0) e.currentTarget.style.backgroundColor = rowBgHover }}
                          onMouseLeave={e => { if (prod.activo !== 0) e.currentTarget.style.backgroundColor = rowBg }}
                        >
                          {/* Referencia */}
                          <td style={{ ...tdStyle, width: "90px", minWidth: "90px", maxWidth: "90px" }}>
                            <div style={{ padding: "10px 16px", fontSize: "11px", fontWeight: 700, color: prod.activo === 0 ? "#9ca3af" : "#1d4ed8" }}>
                              {prod.referencia}
                            </div>
                          </td>

                          {/* Nombre */}
                          <td onClick={() => setWideNombre(w => !w)} style={{ ...tdStyle, padding: 0, position: "sticky", left: 0, zIndex: 3, width: wideNombre ? "320px" : "240px", minWidth: wideNombre ? "320px" : "240px", maxWidth: wideNombre ? "320px" : "240px", backgroundColor: rowBg, transition: "width 0.2s", cursor: "pointer" }}>
                            <div style={{ padding: "10px 16px", fontSize: "13px", color: prod.activo === 0 ? "#9ca3af" : "#1f2937", fontWeight: prod.activo === 0 ? 400 : 500 }}>
                              {prod.nombre}
                              {prod.activo === 0 && (
                                <span style={{ marginLeft: "6px", fontSize: "9px", padding: "1px 4px", borderRadius: "4px", backgroundColor: "#f3f4f6", color: "#6b7280", border: "1px solid #e5e7eb" }}>INACT.</span>
                              )}
                            </div>
                          </td>

                          {/* Selector de presentación */}
                          <td style={{ ...tdStyle, padding: 0, position: "sticky", left: wideNombre ? "320px" : "240px", zIndex: 3, width: "170px", minWidth: "170px", backgroundColor: rowBg, boxShadow: "2px 0 4px -2px rgba(0,0,0,0.1)", transition: "left 0.2s" }}>
                            <div style={{ padding: "6px 10px", display: "flex", alignItems: "center", gap: "4px" }}>
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

                          {/* Stock — por producto + presentación activa */}
                          <td style={{ ...tdStyle, padding: "4px 8px", textAlign: "center" }}>
                            {(() => {
                              const presIdActiva = presentacionActiva.get(prod.id) ?? null
                              const claveStock = `${prod.id}_${presIdActiva ?? "null"}`
                              const stockVal = stockMap.get(claveStock) ?? null
                              const isSavingThis = savingStock === claveStock
                              const sinPres = listaPresProducto.length === 0
                              return (
                                <input
                                  type="number"
                                  min="0"
                                  value={stockVal ?? ""}
                                  onChange={e => handleStockChange(prod.id, presIdActiva, e.target.value)}
                                  disabled={isSavingThis || sinPres}
                                  placeholder={sinPres ? "—" : "0"}
                                  title={sinPres ? "Añade una presentación primero" : `Stock de ${presActiva?.nombre ?? "esta presentación"}`}
                                  style={{
                                    width: "64px", padding: "4px 6px", border: "1.5px solid #d1d5db",
                                    borderRadius: "6px", textAlign: "center", fontSize: "12px",
                                    backgroundColor: (isSavingThis || sinPres) ? "#f5f5f5"
                                      : stockVal == null ? "#fff"
                                      : stockVal === 0 ? "#fef2f2"
                                      : stockVal <= 5 ? "#fff7ed"
                                      : "#f0fdf4",
                                    color: (sinPres || stockVal == null) ? "#9ca3af"
                                      : stockVal === 0 ? "#dc2626"
                                      : stockVal <= 5 ? "#c2410c"
                                      : "#15803d",
                                    fontWeight: stockVal != null ? 600 : 400,
                                    cursor: sinPres ? "not-allowed" : "auto",
                                    outline: "none",
                                  }}
                                />
                              )
                            })()}
                          </td>

                          {/* Celdas de meses */}
                          {mesesVisibles.map(idx => {
                            const mes = idx + 1
                            const presId = presentacionActiva.get(prod.id) ?? null
                            const tipoPres = presId !== null ? String(presId) : null
                            const clave = claveSalida(prod.id, presId, tipoPres)
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
                  {mesesVisibles.map(i => (
                    <td key={i} style={{ padding: "14px", textAlign: "center", color: "#fbbf24", fontSize: "14px" }}>{totalesPorMes[i].toLocaleString()}</td>
                  ))}
                  <td style={{ padding: "14px", textAlign: "right", color: "#fbbf24", fontSize: "14px" }}>
                    {mesesVisibles.reduce((a, i) => a + totalesPorMes[i], 0).toLocaleString()}
                  </td>
                </tr>
              )}

              {productosFiltrados.length === 0 && (
                <tr>
                  <td colSpan={8 + mesesVisibles.length} style={{ padding: "60px", textAlign: "center", color: "#6b7280", backgroundColor: "#fafafa" }}>
                    <div style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>No se encontraron productos</div>
                    <div style={{ fontSize: "13px" }}>{searchTerm ? "Intenta con otro término de búsqueda" : "Agrega productos desde el menú Gestionar → Productos"}</div>
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
          producto={editingProductId === "nuevo" ? null : productos.find(p => p.id === (editingProductId as number)) || null}
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
    departamentoInicialId={departamentoId !== "" ? Number(departamentoId) : undefined}
    onClose={() => setShowSalidaModal(false)}
    onSaved={({ productoId, presentacionId, cantidad, mes, anio: anioGuardado }) => {
      if (anioGuardado !== year) return
      const clave = claveSalida(productoId, presentacionId, presentacionId != null ? String(presentacionId) : null)
      setSalidasMap(prev => {
        const nuevo = new Map(prev)
        if (!nuevo.has(clave)) nuevo.set(clave, new Map())
        const mesMap = nuevo.get(clave)!
        if (cantidad === 0) mesMap.delete(mes)
        else mesMap.set(mes, cantidad)
        return nuevo
      })
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
                        onClick={() => { setShowPresModal(false); setGestionarTab("unidades"); setShowGestionarModal(true) }}
                        style={{ color: "#6366f1", cursor: "pointer", fontWeight: 600 }}
                      >Crear nueva unidad →</span>
                    </div>
                  ) : (
                    <select
                      value={presModalUnidadId}
                      onChange={e => setPresModalUnidadId(Number(e.target.value))}
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

      {/* ── Modal: Gestionar departamentos y unidades ── */}
      {showGestionarModal && (
        <div
          onClick={() => { setShowGestionarModal(false); setEditingDeptId(null); setEditingUnitId(null); setEditingCatId(null); setGestionarProductoSearch("") }}
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.35)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ backgroundColor: "#fff", borderRadius: "16px", width: gestionarTab === "productos" ? "620px" : "480px", maxWidth: "calc(100vw - 32px)", boxShadow: "0 20px 48px rgba(0,0,0,0.15)", overflow: "hidden", maxHeight: "80vh", display: "flex", flexDirection: "column", transition: "width 0.2s" }}
          >
            {/* Header */}
            <div style={{ padding: "20px 24px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "#111827" }}>Gestionar</h2>
              <button
                onClick={() => { setShowGestionarModal(false); setEditingDeptId(null); setEditingUnitId(null); setEditingCatId(null); setGestionarProductoSearch("") }}
                style={{ width: "28px", height: "28px", border: "none", backgroundColor: "#f1f5f9", borderRadius: "6px", cursor: "pointer", color: "#64748b", fontSize: "14px", display: "flex", alignItems: "center", justifyContent: "center" }}
              >✕</button>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: "0", padding: "16px 24px 0", borderBottom: "1px solid #f1f5f9" }}>
              {(["productos", "categorias", "departamentos", "unidades"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => { setGestionarTab(tab); setEditingDeptId(null); setEditingUnitId(null); setEditingCatId(null) }}
                  style={{
                    padding: "8px 14px", border: "none", backgroundColor: "transparent", cursor: "pointer",
                    fontSize: "13px", fontWeight: gestionarTab === tab ? 700 : 500,
                    color: gestionarTab === tab ? "#1d4ed8" : "#64748b",
                    borderBottom: gestionarTab === tab ? "2px solid #3b82f6" : "2px solid transparent",
                    marginBottom: "-1px", whiteSpace: "nowrap",
                  }}
                >
                  {tab === "productos" ? "Productos" : tab === "categorias" ? "Categorías" : tab === "departamentos" ? "Departamentos" : "Unidades"}
                </button>
              ))}
            </div>

            {/* Contenido */}
            <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>

              {/* ── Tab Productos ── */}
              {gestionarTab === "productos" && (() => {
                const term = gestionarProductoSearch.toLowerCase()
                const productosFiltradosModal = productos.filter(p =>
                  !term || p.referencia.toLowerCase().includes(term) || p.nombre.toLowerCase().includes(term)
                )
                const porCategoria = new Map<number, ProductoAlmacen[]>()
                for (const p of productosFiltradosModal) {
                  if (!porCategoria.has(p.categoria_id)) porCategoria.set(p.categoria_id, [])
                  porCategoria.get(p.categoria_id)!.push(p)
                }
                return (
                  <>
                    {/* Cabecera: buscador + botón nuevo */}
                    <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                      <input
                        type="text"
                        placeholder="🔍 Buscar producto..."
                        value={gestionarProductoSearch}
                        onChange={e => setGestionarProductoSearch(e.target.value)}
                        style={{ flex: 1, height: "36px", padding: "0 12px", border: "1.5px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", outline: "none" }}
                      />
                      <button
                        onClick={() => { setShowGestionarModal(false); setEditingProductId("nuevo") }}
                        style={{ height: "36px", padding: "0 14px", border: "none", borderRadius: "8px", backgroundColor: "#16a34a", color: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "5px" }}
                      >
                        <span style={{ fontSize: "15px", lineHeight: 1 }}>+</span> Nuevo
                      </button>
                    </div>

                    {/* Lista agrupada por categoría */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {porCategoria.size === 0 ? (
                        <p style={{ fontSize: "13px", color: "#94a3b8", textAlign: "center", padding: "20px 0", margin: 0 }}>No se encontraron productos</p>
                      ) : categorias.filter(c => porCategoria.has(c.id)).map(cat => (
                        <div key={cat.id}>
                          <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "6px", paddingLeft: "2px" }}>
                            {cat.nombre} <span style={{ fontWeight: 500, color: "#cbd5e1" }}>({porCategoria.get(cat.id)!.length})</span>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            {porCategoria.get(cat.id)!.map(prod => (
                              <div key={prod.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", backgroundColor: prod.activo === 0 ? "#fafafa" : "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                                <span style={{ fontSize: "10px", fontWeight: 700, color: "#1d4ed8", backgroundColor: "#eff6ff", padding: "2px 6px", borderRadius: "4px", flexShrink: 0 }}>{prod.referencia}</span>
                                <span style={{ flex: 1, fontSize: "13px", color: prod.activo === 0 ? "#9ca3af" : "#374151", fontWeight: 500 }}>
                                  {prod.nombre}
                                  {prod.activo === 0 && <span style={{ marginLeft: "6px", fontSize: "9px", padding: "1px 4px", borderRadius: "4px", backgroundColor: "#f3f4f6", color: "#9ca3af", border: "1px solid #e5e7eb" }}>INACT.</span>}
                                </span>
                                <button
                                  onClick={() => { setShowGestionarModal(false); setEditingProductId(prod.id) }}
                                  style={{ padding: "4px 8px", border: "1px solid #e2e8f0", borderRadius: "6px", backgroundColor: "#fff", color: "#475569", fontSize: "12px", cursor: "pointer", flexShrink: 0 }}
                                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1" }}
                                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#fff"; e.currentTarget.style.borderColor = "#e2e8f0" }}
                                >Editar</button>
                                <button
                                  onClick={() => handleDeleteProduct(prod)}
                                  style={{ padding: "4px 8px", border: "1px solid #fca5a5", borderRadius: "6px", backgroundColor: "#fff", color: "#dc2626", fontSize: "12px", cursor: "pointer", flexShrink: 0 }}
                                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#fef2f2" }}
                                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#fff" }}
                                >Eliminar</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )
              })()}

              {/* ── Tab Categorías ── */}
              {gestionarTab === "categorias" && (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "20px" }}>
                    {categorias.length === 0 ? (
                      <p style={{ fontSize: "13px", color: "#94a3b8", textAlign: "center", padding: "20px 0", margin: 0 }}>No hay categorías creadas</p>
                    ) : categorias.map(cat => (
                      <div key={cat.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", backgroundColor: "#f8fafc", borderRadius: "8px", border: `1px solid ${editingCatId === cat.id ? "#93c5fd" : "#e2e8f0"}` }}>
                        {editingCatId === cat.id ? (
                          <>
                            <input
                              autoFocus
                              value={editingCatName}
                              onChange={e => setEditingCatName(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === "Enter") handleGuardarCategoria(cat.id)
                                if (e.key === "Escape") setEditingCatId(null)
                              }}
                              style={{ flex: 1, height: "30px", padding: "0 10px", border: "1.5px solid #93c5fd", borderRadius: "6px", fontSize: "13px", outline: "none", backgroundColor: "#fff" }}
                            />
                            <button
                              onClick={() => handleGuardarCategoria(cat.id)}
                              disabled={!editingCatName.trim()}
                              style={{ padding: "4px 10px", border: "none", borderRadius: "6px", backgroundColor: editingCatName.trim() ? "#3b82f6" : "#bfdbfe", color: "#fff", fontSize: "12px", fontWeight: 600, cursor: editingCatName.trim() ? "pointer" : "not-allowed" }}
                            >Guardar</button>
                            <button
                              onClick={() => setEditingCatId(null)}
                              style={{ padding: "4px 8px", border: "1px solid #e2e8f0", borderRadius: "6px", backgroundColor: "#fff", color: "#64748b", fontSize: "12px", cursor: "pointer" }}
                            >✕</button>
                          </>
                        ) : (
                          <>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                            </svg>
                            <span style={{ flex: 1, fontSize: "13px", fontWeight: 500, color: "#374151" }}>{cat.nombre}</span>
                            <button
                              onClick={() => { setEditingCatId(cat.id); setEditingCatName(cat.nombre) }}
                              style={{ padding: "4px 8px", border: "1px solid #e2e8f0", borderRadius: "6px", backgroundColor: "#fff", color: "#475569", fontSize: "12px", cursor: "pointer" }}
                              onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1" }}
                              onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#fff"; e.currentTarget.style.borderColor = "#e2e8f0" }}
                            >Editar</button>
                            <button
                              onClick={() => handleEliminarCategoria(cat)}
                              style={{ padding: "4px 8px", border: "1px solid #fca5a5", borderRadius: "6px", backgroundColor: "#fff", color: "#dc2626", fontSize: "12px", cursor: "pointer" }}
                              onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#fef2f2" }}
                              onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#fff" }}
                            >Eliminar</button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                  <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "16px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "10px" }}>Nueva categoría</div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input
                        type="text"
                        placeholder="Nombre de la categoría..."
                        value={newCatName}
                        onChange={e => setNewCatName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleCrearCategoria() }}
                        style={{ flex: 1, height: "38px", padding: "0 12px", border: "1.5px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", outline: "none" }}
                      />
                      <button
                        onClick={handleCrearCategoria}
                        disabled={!newCatName.trim()}
                        style={{ height: "38px", padding: "0 16px", border: "none", borderRadius: "8px", backgroundColor: newCatName.trim() ? "#16a34a" : "#d1fae5", color: newCatName.trim() ? "#fff" : "#6ee7b7", fontSize: "13px", fontWeight: 600, cursor: newCatName.trim() ? "pointer" : "not-allowed" }}
                      >Crear</button>
                    </div>
                  </div>
                </>
              )}

              {/* ── Tab Departamentos ── */}
              {gestionarTab === "departamentos" && (
                <>
                  {/* Lista */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "20px" }}>
                    {departamentos.length === 0 ? (
                      <p style={{ fontSize: "13px", color: "#94a3b8", textAlign: "center", padding: "20px 0", margin: 0 }}>No hay departamentos creados</p>
                    ) : departamentos.map(dept => (
                      <div key={dept.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", backgroundColor: "#f8fafc", borderRadius: "8px", border: `1px solid ${editingDeptId === dept.id ? "#93c5fd" : "#e2e8f0"}` }}>
                        {editingDeptId === dept.id ? (
                          <>
                            <input
                              autoFocus
                              value={editingDeptName}
                              onChange={e => setEditingDeptName(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === "Enter") handleGuardarDepartamento(dept.id)
                                if (e.key === "Escape") setEditingDeptId(null)
                              }}
                              style={{ flex: 1, height: "30px", padding: "0 10px", border: "1.5px solid #93c5fd", borderRadius: "6px", fontSize: "13px", outline: "none", backgroundColor: "#fff" }}
                            />
                            <button
                              onClick={() => handleGuardarDepartamento(dept.id)}
                              disabled={!editingDeptName.trim()}
                              style={{ padding: "4px 10px", border: "none", borderRadius: "6px", backgroundColor: editingDeptName.trim() ? "#3b82f6" : "#bfdbfe", color: "#fff", fontSize: "12px", fontWeight: 600, cursor: editingDeptName.trim() ? "pointer" : "not-allowed" }}
                            >Guardar</button>
                            <button
                              onClick={() => setEditingDeptId(null)}
                              style={{ padding: "4px 8px", border: "1px solid #e2e8f0", borderRadius: "6px", backgroundColor: "#fff", color: "#64748b", fontSize: "12px", cursor: "pointer" }}
                            >✕</button>
                          </>
                        ) : (
                          <>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                            </svg>
                            <span style={{ flex: 1, fontSize: "13px", fontWeight: 500, color: "#374151" }}>{dept.nombre}</span>
                            <button
                              onClick={() => { setEditingDeptId(dept.id); setEditingDeptName(dept.nombre) }}
                              style={{ padding: "4px 8px", border: "1px solid #e2e8f0", borderRadius: "6px", backgroundColor: "#fff", color: "#475569", fontSize: "12px", cursor: "pointer" }}
                              onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1" }}
                              onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#fff"; e.currentTarget.style.borderColor = "#e2e8f0" }}
                            >Editar</button>
                            <button
                              onClick={() => handleEliminarDepartamento(dept)}
                              style={{ padding: "4px 8px", border: "1px solid #fca5a5", borderRadius: "6px", backgroundColor: "#fff", color: "#dc2626", fontSize: "12px", cursor: "pointer" }}
                              onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#fef2f2" }}
                              onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#fff" }}
                            >Eliminar</button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                  {/* Crear nuevo */}
                  <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "16px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "10px" }}>Nuevo departamento</div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input
                        type="text"
                        placeholder="Nombre del departamento..."
                        value={newDeptName}
                        onChange={e => setNewDeptName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleCrearDepartamento() }}
                        style={{ flex: 1, height: "38px", padding: "0 12px", border: "1.5px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", outline: "none" }}
                      />
                      <button
                        onClick={handleCrearDepartamento}
                        disabled={!newDeptName.trim()}
                        style={{ height: "38px", padding: "0 16px", border: "none", borderRadius: "8px", backgroundColor: newDeptName.trim() ? "#16a34a" : "#d1fae5", color: newDeptName.trim() ? "#fff" : "#6ee7b7", fontSize: "13px", fontWeight: 600, cursor: newDeptName.trim() ? "pointer" : "not-allowed" }}
                      >Crear</button>
                    </div>
                  </div>
                </>
              )}

              {/* ── Tab Unidades ── */}
              {gestionarTab === "unidades" && (
                <>
                  {/* Lista */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "20px" }}>
                    {unidadesPresentacion.length === 0 ? (
                      <p style={{ fontSize: "13px", color: "#94a3b8", textAlign: "center", padding: "20px 0", margin: 0 }}>No hay unidades creadas</p>
                    ) : unidadesPresentacion.map(unidad => (
                      <div key={unidad.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", backgroundColor: "#f8fafc", borderRadius: "8px", border: `1px solid ${editingUnitId === unidad.id ? "#93c5fd" : "#e2e8f0"}` }}>
                        {editingUnitId === unidad.id ? (
                          <>
                            <input
                              autoFocus
                              value={editingUnitName}
                              onChange={e => setEditingUnitName(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === "Enter") handleGuardarUnidad(unidad.id)
                                if (e.key === "Escape") setEditingUnitId(null)
                              }}
                              style={{ flex: 1, height: "30px", padding: "0 10px", border: "1.5px solid #93c5fd", borderRadius: "6px", fontSize: "13px", outline: "none", backgroundColor: "#fff" }}
                            />
                            <button
                              onClick={() => handleGuardarUnidad(unidad.id)}
                              disabled={!editingUnitName.trim()}
                              style={{ padding: "4px 10px", border: "none", borderRadius: "6px", backgroundColor: editingUnitName.trim() ? "#3b82f6" : "#bfdbfe", color: "#fff", fontSize: "12px", fontWeight: 600, cursor: editingUnitName.trim() ? "pointer" : "not-allowed" }}
                            >Guardar</button>
                            <button
                              onClick={() => setEditingUnitId(null)}
                              style={{ padding: "4px 8px", border: "1px solid #e2e8f0", borderRadius: "6px", backgroundColor: "#fff", color: "#64748b", fontSize: "12px", cursor: "pointer" }}
                            >✕</button>
                          </>
                        ) : (
                          <>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                              <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
                            </svg>
                            <span style={{ flex: 1, fontSize: "13px", fontWeight: 500, color: "#374151" }}>{unidad.nombre}</span>
                            <button
                              onClick={() => { setEditingUnitId(unidad.id); setEditingUnitName(unidad.nombre) }}
                              style={{ padding: "4px 8px", border: "1px solid #e2e8f0", borderRadius: "6px", backgroundColor: "#fff", color: "#475569", fontSize: "12px", cursor: "pointer" }}
                              onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1" }}
                              onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#fff"; e.currentTarget.style.borderColor = "#e2e8f0" }}
                            >Editar</button>
                            <button
                              onClick={() => handleEliminarUnidad(unidad)}
                              style={{ padding: "4px 8px", border: "1px solid #fca5a5", borderRadius: "6px", backgroundColor: "#fff", color: "#dc2626", fontSize: "12px", cursor: "pointer" }}
                              onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#fef2f2" }}
                              onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#fff" }}
                            >Eliminar</button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                  {/* Crear nueva */}
                  <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "16px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "10px" }}>Nueva unidad</div>
                    <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 10px" }}>
                      Disponible para asignar a cualquier producto (ej. Litro, Garrafa 5L, Spray…)
                    </p>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input
                        type="text"
                        placeholder="Ej: Garrafa 5L"
                        value={newUnitNameGlobal}
                        onChange={e => setNewUnitNameGlobal(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleCrearUnidadGlobal() }}
                        style={{ flex: 1, height: "38px", padding: "0 12px", border: "1.5px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", outline: "none" }}
                      />
                      <button
                        onClick={handleCrearUnidadGlobal}
                        disabled={!newUnitNameGlobal.trim()}
                        style={{ height: "38px", padding: "0 16px", border: "none", borderRadius: "8px", backgroundColor: newUnitNameGlobal.trim() ? "#6366f1" : "#e0e7ff", color: newUnitNameGlobal.trim() ? "#fff" : "#a5b4fc", fontSize: "13px", fontWeight: 600, cursor: newUnitNameGlobal.trim() ? "pointer" : "not-allowed" }}
                      >Crear</button>
                    </div>
                  </div>
                </>
              )}
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