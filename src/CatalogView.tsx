import { useState, useEffect, useMemo, useCallback, useRef, Fragment, memo } from "react"
import { useConfirm } from "./ConfirmDialog"
import { useToast } from "./Toast"
import {
  getCategorias,
  getProductos,
  getDepartamentosProd,
  deleteProduct,
  upsertSalida,
  upsertStock,
  ajustarStock,
  getStockProductos,
  crearDepartamentoProd,
  getSalidasByYear,
  getAniosDisponibles,
  actualizarDepartamentoProd,
  eliminarDepartamentoProd,
  crearCategoria,
  actualizarCategoria,
  eliminarCategoria,
  exportarProductosJSON,
  importarProductosJSON,
  eliminarSalidasDepartamento,
  claveSalida,
  stockVisible,
  labelPrecio,
  getPreferenciaPres,
  setPreferenciaPres,
  type TipoProducto,
  type CategoriaProducto,
  type ProductoAlmacen,
  type DepartamentoProd,
  type ExportacionProductos,
} from "./cleaningService"
import { ModalProducto } from "./CleaningProductModal"
import { ModalSalida } from "./ConsumptionModal"

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]
const MESES_CORTOS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
]

// ─── Heatmap ──────────────────────────────────────────────────────────────────

function getConsumoColor(valor: number, maxValor: number): string {
  if (valor === 0) return "#ffffff"
  const i = Math.min(valor / (maxValor || 1), 1)
  if (i < 0.25) return "#fef9c3"
  if (i < 0.5)  return "#fef08a"
  if (i < 0.75) return "#bef264"
  return "#65a30d"
}
function getConsumoTextColor(v: number): string {
  return v > 0 ? "#1a1a1a" : "#9ca3af"
}

// ─── Badge tipo producto ──────────────────────────────────────────────────────

const TIPO_CONFIG: Record<TipoProducto, { label: string; bg: string; color: string }> = {
  UNIDAD: { label: "Ud",    bg: "#eff6ff", color: "#2563eb" },
  CAJA:   { label: "Caja",  bg: "#f0fdf4", color: "#16a34a" },
  FARDO:  { label: "Fardo", bg: "#fef3c7", color: "#d97706" },
}

function TipoBadge({ tipo }: { tipo: TipoProducto }) {
  const cfg = TIPO_CONFIG[tipo]
  return (
    <span style={{
      fontSize: "10px", fontWeight: 700, padding: "1px 6px", borderRadius: "4px",
      backgroundColor: cfg.bg, color: cfg.color, letterSpacing: "0.02em", flexShrink: 0,
    }}>{cfg.label}</span>
  )
}

// ─── Toggle Caja/Unidades (solo para tipo CAJA) ───────────────────────────────

function PresToggle({
  value,
  onChange,
}: {
  value: "caja" | "unidad"
  onChange: (v: "caja" | "unidad") => void
}) {
  const btn = (v: "caja" | "unidad", label: string) => (
    <button
      key={v}
      onClick={() => onChange(v)}
      style={{
        padding: "2px 8px", fontSize: "11px", fontWeight: 600,
        border: "none", borderRadius: "4px", cursor: "pointer",
        backgroundColor: value === v ? "#2563eb" : "transparent",
        color: value === v ? "#fff" : "#94a3b8",
        transition: "all 0.1s",
      }}
    >{label}</button>
  )
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: "1px",
      backgroundColor: "#f1f5f9", borderRadius: "6px", padding: "2px",
    }}>
      {btn("caja", "Cajas")}
      {btn("unidad", "Uds")}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function VistaCatalogo({ onDepartamentoCreado }: { onDepartamentoCreado?: () => void }) {
  const toast = useToast()
  const { confirm, dialog } = useConfirm()

  // ── Modales ──
  const [showSalidaModal, setShowSalidaModal] = useState(false)
  const [editingProductId, setEditingProductId] = useState<number | "nuevo" | null>(null)

  // ── Datos principales ──
  const [categorias, setCategorias] = useState<CategoriaProducto[]>([])
  const [productos, setProductos] = useState<ProductoAlmacen[]>([])
  const [departamentos, setDepartamentos] = useState<DepartamentoProd[]>([])

  // ── Filtros ──
  const LS_DEPT_KEY = "inventario_dpto_seleccionado"
  const [departamentoId, setDepartamentoId] = useState<number | "">(() => {
    const saved = localStorage.getItem("inventario_dpto_seleccionado")
    return saved ? Number(saved) : ""
  })
  const [year, setYear] = useState(new Date().getFullYear())
  const [searchTerm, setSearchTerm] = useState("")
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set())
  const [mesesFiltro, setMesesFiltro] = useState<Set<number>>(new Set())

  // ── Salidas: productoId(string) → mes → cantidad (siempre unidades base) ──
  const [salidasMap, setSalidasMap] = useState<Map<string, Map<number, number>>>(new Map())

  // ── Stock: producto_id → cantidad en unidades base ──
  const [stockMap, setStockMap] = useState<Map<number, number>>(new Map())

  // ── Preferencia de presentación: productoId → "caja"|"unidad" (solo CAJA) ──
  // Se inicializa desde localStorage al cargar el departamento
  const [prefMap, setPrefMap] = useState<Map<number, "caja" | "unidad">>(new Map())

  // ── UI ──
  const [wideNombre, setWideNombre] = useState(false)
  const [savingStock, setSavingStock] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingCell, setSavingCell] = useState<{ productoId: number; mes: number } | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [availableYears, setAvailableYears] = useState<number[]>([])

  // ── Gestionar modal ──
  const [showGestionarModal, setShowGestionarModal] = useState(false)
  const [gestionarTab, setGestionarTab] = useState<"departamentos" | "productos" | "categorias">("departamentos")
  const [newDeptName, setNewDeptName] = useState("")
  const [gestionarDropdownOpen, setGestionarDropdownOpen] = useState(false)
  const [editingDeptId, setEditingDeptId] = useState<number | null>(null)
  const [editingDeptName, setEditingDeptName] = useState("")
  const [editingCatId, setEditingCatId] = useState<number | null>(null)
  const [editingCatName, setEditingCatName] = useState("")
  const [newCatName, setNewCatName] = useState("")
  const [gestionarProductoSearch, setGestionarProductoSearch] = useState("")

  const departamentoIdRef = useRef<number | "" | undefined>(undefined)
  useEffect(() => { departamentoIdRef.current = departamentoId }, [departamentoId])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const toastRef = useRef(toast)
  useEffect(() => { toastRef.current = toast })
  const stockMapRef = useRef(stockMap)
  useEffect(() => { stockMapRef.current = stockMap }, [stockMap])

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
      const [cats, prods, depts, anios, stockInicial] = await Promise.all([
        getCategorias(),
        getProductos(false),
        getDepartamentosProd(),
        getAniosDisponibles(),
        getStockProductos(),
      ])
      setCategorias(cats)
      setProductos(prods)
      setDepartamentos(depts)
      setAvailableYears(anios)
      setExpandedCategories(new Set(cats.map(c => c.id)))
      setStockMap(stockInicial)
    } catch (e: any) {
      toastRef.current.error("Error", e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  // ─── Carga de salidas ──────────────────────────────────────────────────────

  const cargarSalidas = useCallback(async () => {
    if (departamentoId === "") { setSalidasMap(new Map()); return }
    try {
      const mapa = await getSalidasByYear(year, Number(departamentoId))
      setSalidasMap(mapa)
    } catch (e: any) {
      toastRef.current.error("Error", e?.message ?? String(e))
      setSalidasMap(new Map())
    }
  }, [departamentoId, year])

  // ─── Inicializar preferencias desde localStorage cuando cambia el departamento ──

  useEffect(() => {
    if (departamentoId === "" || productos.length === 0) return
    const nuevoPrefMap = new Map<number, "caja" | "unidad">()
    for (const prod of productos) {
      if (prod.tipo_producto === "CAJA") {
        nuevoPrefMap.set(prod.id, getPreferenciaPres(prod.id, Number(departamentoId)))
      }
    }
    setPrefMap(nuevoPrefMap)
  }, [departamentoId, productos])

  // Persistir departamento seleccionado
  useEffect(() => {
    if (departamentoId !== "") localStorage.setItem(LS_DEPT_KEY, String(departamentoId))
  }, [departamentoId])

  useEffect(() => { loadInitialData() }, [loadInitialData])
  useEffect(() => { cargarSalidas() }, [departamentoId, year, cargarSalidas])

  // Auto-seleccionar primer departamento solo si el guardado ya no existe en la lista
  useEffect(() => {
    if (departamentos.length === 0) return
    if (departamentoId !== "" && departamentos.some(d => d.id === departamentoId)) return
    setDepartamentoId(departamentos[0].id)
  }, [departamentos])

  // ─── Helpers de consumo ───────────────────────────────────────────────────

  /** Cantidad en unidades base almacenada en BD para un producto/mes */
  function getConsumoBase(productoId: number, mes: number): number {
    return salidasMap.get(claveSalida(productoId))?.get(mes) ?? 0
  }

  // ─── Actualizar celda ─────────────────────────────────────────────────────

  const handleCellChange = useCallback(async (
    prod: ProductoAlmacen,
    mes: number,
    valorStr: string
  ) => {
    if (departamentoIdRef.current === "") return
    const valorInput = Number(valorStr)
    if (isNaN(valorInput) || valorInput < 0) return

    // Convertir a unidades base antes de guardar
    let valorBase: number = valorInput
    const pref = prefMap.get(prod.id) ?? "unidad"
    if (prod.tipo_producto === "CAJA" && pref === "caja" && prod.uds_por_caja && prod.uds_por_caja > 1) {
      valorBase = Math.round(valorInput * prod.uds_por_caja)
    }

    // Validar stock solo si es un incremento respecto al valor anterior
    // (reducciones y reversiones nunca necesitan validación)
    const cantidadAnteriorLocal = salidasMap.get(claveSalida(prod.id))?.get(mes) ?? 0
    if (valorBase > cantidadAnteriorLocal) {
      const incremento = valorBase - cantidadAnteriorLocal
      if (!stockMapRef.current.has(prod.id)) {
        const ok = await confirm(
          "Stock no configurado",
          { detail: `No hay stock registrado para "${prod.nombre}". ¿Registrar la salida igualmente?`, confirmLabel: "Registrar", danger: false }
        )
        if (!ok) return
      } else if (incremento > stockMapRef.current.get(prod.id)!) {
        toastRef.current.error(
          "Stock insuficiente",
          `Solo hay ${stockVisible(stockMapRef.current.get(prod.id)!, prod.tipo_producto, prod.uds_por_caja)} disponibles y estás sacando ${stockVisible(incremento, prod.tipo_producto, prod.uds_por_caja)} adicionales.`
        )
        return
      }
    }

    setSavingCell({ productoId: prod.id, mes })
    try {
      // upsertSalida devuelve la cantidad anterior para calcular el delta de stock
      const cantidadAnterior = await upsertSalida({
        producto_id: prod.id,
        departamento_id: Number(departamentoIdRef.current),
        cantidad: valorBase,
        mes,
        anio: year,
      })

      // Ajustar stock: delta positivo devuelve unidades, negativo las descuenta
      const delta = cantidadAnterior - valorBase
      await ajustarStock(prod.id, delta)

      // Actualizar mapa local de salidas — crear nuevo Map interno para que
      // React.memo de las otras filas detecte que su prop no ha cambiado
      const clave = claveSalida(prod.id)
      setSalidasMap(prev => {
        const nuevo = new Map(prev)
        const mesMap = new Map(prev.get(clave))
        if (valorBase === 0) mesMap.delete(mes)
        else mesMap.set(mes, valorBase)
        nuevo.set(clave, mesMap)
        return nuevo
      })

      // Reflejar el cambio en el stock local sin necesidad de recargar
      setStockMap(prev => {
        const nuevo = new Map(prev)
        const actual = nuevo.get(prod.id) ?? 0
        nuevo.set(prod.id, Math.max(0, actual + delta))
        return nuevo
      })
    } catch (e: any) {
      toastRef.current.error("Error", e?.message ?? String(e))
    } finally {
      setSavingCell(null)
    }
  }, [year, prefMap])

  // ─── Actualizar stock ─────────────────────────────────────────────────────

  const handleStockChange = useCallback(async (
    prod: ProductoAlmacen,
    valorStr: string
  ) => {
    const valor = valorStr.trim() === "" ? null : Number(valorStr)
    if (valor !== null && (isNaN(valor) || valor < 0)) return

    // Convertir cajas → unidades base si el input es en cajas
    let valorBase: number | null = valor
    if (valor !== null && prod.tipo_producto === "CAJA" && prod.uds_por_caja && prod.uds_por_caja > 1) {
      // El stock siempre se edita en unidades base directamente (campo numérico)
      // pero mostramos la versión legible. No hay toggle aquí, solo se escribe en uds.
      valorBase = valor
    }

    setSavingStock(prod.id)
    try {
      await upsertStock(prod.id, valorBase)
      setStockMap(prev => {
        const nuevo = new Map(prev)
        if (valorBase === null) nuevo.delete(prod.id)
        else nuevo.set(prod.id, valorBase)
        return nuevo
      })
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    } finally {
      setSavingStock(null)
    }
  }, [toast])

  const handleToggleWideNombre = useCallback(() => setWideNombre(w => !w), [])

  const handleSetPref = useCallback((prodId: number, v: "caja" | "unidad") => {
    setPrefMap(prev => { const n = new Map(prev); n.set(prodId, v); return n })
    setPreferenciaPres(prodId, Number(departamentoIdRef.current), v)
  }, [])

  // ─── Eliminar producto ────────────────────────────────────────────────────

  async function handleDeleteProduct(producto: ProductoAlmacen) {
    const ok = await confirm(
      `¿Eliminar el producto "${producto.referencia}"?`,
      { confirmLabel: "Eliminar", danger: true, detail: "Se borrarán también todos los registros de salida asociados." }
    )
    if (!ok) return
    try {
      await deleteProduct(producto.id)
      setProductos(prev => prev.filter(p => p.id !== producto.id))
      setSalidasMap(prev => {
        const nuevo = new Map(prev)
        nuevo.delete(claveSalida(producto.id))
        return nuevo
      })
      setStockMap(prev => { const n = new Map(prev); n.delete(producto.id); return n })
      toast.success("Producto eliminado")
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    }
  }

  // ─── Gestión departamentos ────────────────────────────────────────────────

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

  async function handleEliminarDepartamento(dept: DepartamentoProd) {
    const ok = await confirm(
      `¿Eliminar el departamento "${dept.nombre}"?`,
      { confirmLabel: "Eliminar", danger: true, detail: "Se eliminarán también todos los registros de consumo asociados." }
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

  // ─── Gestión categorías ───────────────────────────────────────────────────

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

  // ─── Limpiar movimientos ──────────────────────────────────────────────────

  const handleLimpiarMovimientos = async () => {
    if (departamentoId === "") return
    const deptNombre = departamentos.find(d => d.id === departamentoId)?.nombre ?? ""
    const ok = await confirm(
      `¿Eliminar todos los movimientos de "${deptNombre}" en ${year}?`,
      { confirmLabel: "Eliminar todo", danger: true, detail: "Esta acción no se puede deshacer." }
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

  // ─── Export / Import JSON ─────────────────────────────────────────────────

  const handleExportJSON = async () => {
    try {
      const datos = await exportarProductosJSON()
      const blob = new Blob([JSON.stringify(datos, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `productos_${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success("Exportación completada", `${datos.productos.length} productos exportados`)
    } catch (e: any) {
      toast.error("Error exportando", e?.message ?? String(e))
    }
  }

  const handleImportClick = () => fileInputRef.current?.click()

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsImporting(true)
    try {
      const text = await file.text()
      let datos: ExportacionProductos
      try { datos = JSON.parse(text) } catch { throw new Error("El archivo no es un JSON válido.") }
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
      p.referencia.toLowerCase().includes(term) || p.nombre.toLowerCase().includes(term)
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

  const mesesVisibles = useMemo(() =>
    mesesFiltro.size === 0
      ? MESES.map((_, i) => i)
      : MESES.map((_, i) => i).filter(i => mesesFiltro.has(i))
  , [mesesFiltro])

  // Totales por mes (siempre en unidades base)
  const totalesPorMes = useMemo(() => {
    const totals = new Array(12).fill(0)
    for (const prod of productosFiltrados) {
      for (let mes = 1; mes <= 12; mes++) {
        totals[mes - 1] += getConsumoBase(prod.id, mes)
      }
    }
    return totals
  }, [productosFiltrados, salidasMap])

  const maxConsumo = useMemo(() => {
    let max = 0
    for (const prod of productosFiltrados) {
      for (let mes = 1; mes <= 12; mes++) {
        max = Math.max(max, getConsumoBase(prod.id, mes))
      }
    }
    return max
  }, [productosFiltrados, salidasMap])

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
              setDepartamentoId(v === "__todos__" ? "" : Number(v))
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
                  {[
                    { tab: "productos" as const, icon: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01", label: "Productos" },
                    { tab: "categorias" as const, icon: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z", label: "Categorías" },
                    { tab: "departamentos" as const, icon: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", label: "Departamentos" },
                  ].map(({ tab, icon, label }) => (
                    <button
                      key={tab}
                      onClick={() => { setGestionarTab(tab); setShowGestionarModal(true); setGestionarDropdownOpen(false) }}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", border: "none", backgroundColor: "transparent", borderRadius: "8px", cursor: "pointer", textAlign: "left", fontSize: "13px", color: "#374151", fontWeight: 500 }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#f8fafc" }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent" }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d={icon}/>
                      </svg>
                      {label}
                    </button>
                  ))}

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
                    if (next.has(i)) { next.delete(i) } else { next.add(i) }
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

      {/* ── Tabla ── */}
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
                <th style={{ ...thStyle, width: "90px", minWidth: "90px" }}><div style={{ padding: "12px 16px" }}>Ref.</div></th>
                <th onClick={() => setWideNombre(w => !w)} style={{ ...thStyle, padding: 0, position: "sticky", left: 0, zIndex: 3, width: wideNombre ? "320px" : "240px", minWidth: wideNombre ? "320px" : "240px", boxShadow: "none", cursor: "pointer", userSelect: "none", transition: "width 0.2s" }}>
                  <div style={{ padding: "12px 16px" }}>Nombre</div>
                </th>
                {/* Columna Tipo + Precio (reemplaza "Presentación" + "Precio") */}
                <th style={{ ...thStyle, padding: 0, position: "sticky", left: wideNombre ? "320px" : "240px", zIndex: 3, width: "200px", minWidth: "200px", boxShadow: "2px 0 4px -2px rgba(0,0,0,0.1)", transition: "left 0.2s" }}>
                  <div style={{ padding: "12px 16px" }}>Tipo / Precio</div>
                </th>
                <th style={{ ...thStyle, minWidth: "100px", textAlign: "center" }}>Stock</th>
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
                    {/* Fila categoría */}
                    <tr
                      style={{ backgroundColor: isExpanded ? "#eff6ff" : "#f8fafc", cursor: "pointer", borderBottom: "1px solid #f1f5f9" }}
                      onClick={() => toggleCategory(cat.id)}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#eff6ff" }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = isExpanded ? "#eff6ff" : "#f8fafc" }}
                    >
                      <td colSpan={6 + mesesVisibles.length} style={{ padding: "10px 16px", fontWeight: 700, color: "#1e40af", position: "sticky", left: 0, backgroundColor: isExpanded ? "#eff6ff" : "#f8fafc", zIndex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "12px", transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s", color: "#3b82f6" }}>▶</span>
                          <span style={{ fontSize: "13px" }}>{cat.nombre}</span>
                          <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "10px", backgroundColor: isExpanded ? "#dbeafe" : "#e2e8f0", color: isExpanded ? "#2563eb" : "#64748b", fontWeight: 600 }}>{prodsEnCat.length}</span>
                        </div>
                      </td>
                    </tr>

                    {/* Filas de productos */}
                    {isExpanded && prodsEnCat.map((prod, rowIdx) => (
                      <ProductRow
                        key={prod.id}
                        prod={prod}
                        rowIdx={rowIdx}
                        mesData={salidasMap.get(claveSalida(prod.id))}
                        stock={stockMap.get(prod.id) ?? null}
                        savingCellMes={savingCell?.productoId === prod.id ? savingCell.mes : null}
                        isSavingStock={savingStock === prod.id}
                        mesesVisibles={mesesVisibles}
                        maxConsumo={maxConsumo}
                        wideNombre={wideNombre}
                        pref={prefMap.get(prod.id) ?? "caja"}
                        onCellChange={handleCellChange}
                        onStockChange={handleStockChange}
                        onToggleWideNombre={handleToggleWideNombre}
                        onSetPref={handleSetPref}
                      />
                    ))}
                  </Fragment>
                )
              })}

              {/* Fila de totales */}
              {productosFiltrados.length > 0 && (
                <tr style={{ backgroundColor: "#111827", fontWeight: 700 }}>
                  <td colSpan={3} style={{ padding: "14px", textAlign: "right", color: "#f9fafb", fontSize: "13px" }}>TOTALES</td>
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
                  <td colSpan={6 + mesesVisibles.length} style={{ padding: "60px", textAlign: "center", color: "#6b7280", backgroundColor: "#fafafa" }}>
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
          stockMap={stockMap}
          onClose={() => setShowSalidaModal(false)}
          onSaved={({ productoId, cantidad, cantidadAnterior, mes, anio: anioGuardado }) => {
            // Actualizar mapa de salidas si el año coincide con el que se está viendo
            if (anioGuardado === year) {
              const clave = claveSalida(productoId)
              setSalidasMap(prev => {
                const nuevo = new Map(prev)
                if (!nuevo.has(clave)) nuevo.set(clave, new Map())
                const mesMap = nuevo.get(clave)!
                if (cantidad === 0) mesMap.delete(mes)
                else mesMap.set(mes, cantidad)
                return nuevo
              })
            }
            // Actualizar stock local con el delta (independiente del año visualizado)
            const delta = cantidadAnterior - cantidad
            if (delta !== 0) {
              setStockMap(prev => {
                const nuevo = new Map(prev)
                const actual = nuevo.get(productoId) ?? 0
                nuevo.set(productoId, Math.max(0, actual + delta))
                return nuevo
              })
            }
          }}
        />
      )}

      {/* ── Modal: Gestionar ── */}
      {showGestionarModal && (
        <div
          onClick={() => { setShowGestionarModal(false); setEditingDeptId(null); setEditingCatId(null); setGestionarProductoSearch("") }}
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
                onClick={() => { setShowGestionarModal(false); setEditingDeptId(null); setEditingCatId(null); setGestionarProductoSearch("") }}
                style={{ width: "28px", height: "28px", border: "none", backgroundColor: "#f1f5f9", borderRadius: "6px", cursor: "pointer", color: "#64748b", fontSize: "14px", display: "flex", alignItems: "center", justifyContent: "center" }}
              >✕</button>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: "0", padding: "16px 24px 0", borderBottom: "1px solid #f1f5f9" }}>
              {(["productos", "categorias", "departamentos"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => { setGestionarTab(tab); setEditingDeptId(null); setEditingCatId(null) }}
                  style={{
                    padding: "8px 14px", border: "none", backgroundColor: "transparent", cursor: "pointer",
                    fontSize: "13px", fontWeight: gestionarTab === tab ? 700 : 500,
                    color: gestionarTab === tab ? "#1d4ed8" : "#64748b",
                    borderBottom: gestionarTab === tab ? "2px solid #3b82f6" : "2px solid transparent",
                    marginBottom: "-1px", whiteSpace: "nowrap",
                  }}
                >
                  {tab === "productos" ? "Productos" : tab === "categorias" ? "Categorías" : "Departamentos"}
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
                                <TipoBadge tipo={prod.tipo_producto} />
                                <span style={{ flex: 1, fontSize: "13px", color: prod.activo === 0 ? "#9ca3af" : "#374151", fontWeight: 500 }}>
                                  {prod.nombre}
                                  {prod.activo === 0 && <span style={{ marginLeft: "6px", fontSize: "9px", padding: "1px 4px", borderRadius: "4px", backgroundColor: "#f3f4f6", color: "#9ca3af", border: "1px solid #e5e7eb" }}>INACT.</span>}
                                </span>
                                <span style={{ fontSize: "11px", color: "#94a3b8", flexShrink: 0 }}>
                                  {labelPrecio(prod.precio, prod.tipo_producto, prod.uds_por_caja)}
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
                            <input autoFocus value={editingCatName} onChange={e => setEditingCatName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleGuardarCategoria(cat.id); if (e.key === "Escape") setEditingCatId(null) }}
                              style={{ flex: 1, height: "30px", padding: "0 10px", border: "1.5px solid #93c5fd", borderRadius: "6px", fontSize: "13px", outline: "none", backgroundColor: "#fff" }} />
                            <button onClick={() => handleGuardarCategoria(cat.id)} disabled={!editingCatName.trim()} style={{ padding: "4px 10px", border: "none", borderRadius: "6px", backgroundColor: editingCatName.trim() ? "#3b82f6" : "#bfdbfe", color: "#fff", fontSize: "12px", fontWeight: 600, cursor: editingCatName.trim() ? "pointer" : "not-allowed" }}>Guardar</button>
                            <button onClick={() => setEditingCatId(null)} style={{ padding: "4px 8px", border: "1px solid #e2e8f0", borderRadius: "6px", backgroundColor: "#fff", color: "#64748b", fontSize: "12px", cursor: "pointer" }}>✕</button>
                          </>
                        ) : (
                          <>
                            <span style={{ flex: 1, fontSize: "13px", fontWeight: 500, color: "#374151" }}>{cat.nombre}</span>
                            <button onClick={() => { setEditingCatId(cat.id); setEditingCatName(cat.nombre) }} style={{ padding: "4px 8px", border: "1px solid #e2e8f0", borderRadius: "6px", backgroundColor: "#fff", color: "#475569", fontSize: "12px", cursor: "pointer" }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#f8fafc" }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#fff" }}>Editar</button>
                            <button onClick={() => handleEliminarCategoria(cat)} style={{ padding: "4px 8px", border: "1px solid #fca5a5", borderRadius: "6px", backgroundColor: "#fff", color: "#dc2626", fontSize: "12px", cursor: "pointer" }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#fef2f2" }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#fff" }}>Eliminar</button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                  <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "16px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "10px" }}>Nueva categoría</div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input type="text" placeholder="Nombre de la categoría..." value={newCatName} onChange={e => setNewCatName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleCrearCategoria() }} style={{ flex: 1, height: "38px", padding: "0 12px", border: "1.5px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", outline: "none" }} />
                      <button onClick={handleCrearCategoria} disabled={!newCatName.trim()} style={{ height: "38px", padding: "0 16px", border: "none", borderRadius: "8px", backgroundColor: newCatName.trim() ? "#16a34a" : "#d1fae5", color: newCatName.trim() ? "#fff" : "#6ee7b7", fontSize: "13px", fontWeight: 600, cursor: newCatName.trim() ? "pointer" : "not-allowed" }}>Crear</button>
                    </div>
                  </div>
                </>
              )}

              {/* ── Tab Departamentos ── */}
              {gestionarTab === "departamentos" && (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "20px" }}>
                    {departamentos.length === 0 ? (
                      <p style={{ fontSize: "13px", color: "#94a3b8", textAlign: "center", padding: "20px 0", margin: 0 }}>No hay departamentos creados</p>
                    ) : departamentos.map(dept => (
                      <div key={dept.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", backgroundColor: "#f8fafc", borderRadius: "8px", border: `1px solid ${editingDeptId === dept.id ? "#93c5fd" : "#e2e8f0"}` }}>
                        {editingDeptId === dept.id ? (
                          <>
                            <input autoFocus value={editingDeptName} onChange={e => setEditingDeptName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleGuardarDepartamento(dept.id); if (e.key === "Escape") setEditingDeptId(null) }}
                              style={{ flex: 1, height: "30px", padding: "0 10px", border: "1.5px solid #93c5fd", borderRadius: "6px", fontSize: "13px", outline: "none", backgroundColor: "#fff" }} />
                            <button onClick={() => handleGuardarDepartamento(dept.id)} disabled={!editingDeptName.trim()} style={{ padding: "4px 10px", border: "none", borderRadius: "6px", backgroundColor: editingDeptName.trim() ? "#3b82f6" : "#bfdbfe", color: "#fff", fontSize: "12px", fontWeight: 600, cursor: editingDeptName.trim() ? "pointer" : "not-allowed" }}>Guardar</button>
                            <button onClick={() => setEditingDeptId(null)} style={{ padding: "4px 8px", border: "1px solid #e2e8f0", borderRadius: "6px", backgroundColor: "#fff", color: "#64748b", fontSize: "12px", cursor: "pointer" }}>✕</button>
                          </>
                        ) : (
                          <>
                            <span style={{ flex: 1, fontSize: "13px", fontWeight: 500, color: "#374151" }}>{dept.nombre}</span>
                            <button onClick={() => { setEditingDeptId(dept.id); setEditingDeptName(dept.nombre) }} style={{ padding: "4px 8px", border: "1px solid #e2e8f0", borderRadius: "6px", backgroundColor: "#fff", color: "#475569", fontSize: "12px", cursor: "pointer" }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#f8fafc" }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#fff" }}>Editar</button>
                            <button onClick={() => handleEliminarDepartamento(dept)} style={{ padding: "4px 8px", border: "1px solid #fca5a5", borderRadius: "6px", backgroundColor: "#fff", color: "#dc2626", fontSize: "12px", cursor: "pointer" }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#fef2f2" }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#fff" }}>Eliminar</button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                  <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "16px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "10px" }}>Nuevo departamento</div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input type="text" placeholder="Nombre del departamento..." value={newDeptName} onChange={e => setNewDeptName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleCrearDepartamento() }} style={{ flex: 1, height: "38px", padding: "0 12px", border: "1.5px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", outline: "none" }} />
                      <button onClick={handleCrearDepartamento} disabled={!newDeptName.trim()} style={{ height: "38px", padding: "0 16px", border: "none", borderRadius: "8px", backgroundColor: newDeptName.trim() ? "#16a34a" : "#d1fae5", color: newDeptName.trim() ? "#fff" : "#6ee7b7", fontSize: "13px", fontWeight: 600, cursor: newDeptName.trim() ? "pointer" : "not-allowed" }}>Crear</button>
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

// ─── Estilos ──────────────────────────────────────────────────────────────────

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

// ─── Fila de producto memoizada ───────────────────────────────────────────────
// Definida aquí abajo para que thStyle/tdStyle ya estén inicializados.
// React.memo evita re-renders en filas que no cambiaron cuando el usuario
// edita una celda de otro producto.

interface ProductRowProps {
  prod: ProductoAlmacen
  rowIdx: number
  mesData: Map<number, number> | undefined
  stock: number | null
  savingCellMes: number | null
  isSavingStock: boolean
  mesesVisibles: number[]
  maxConsumo: number
  wideNombre: boolean
  pref: "caja" | "unidad"
  onCellChange: (prod: ProductoAlmacen, mes: number, value: string) => void
  onStockChange: (prod: ProductoAlmacen, value: string) => void
  onToggleWideNombre: () => void
  onSetPref: (prodId: number, v: "caja" | "unidad") => void
}

const ProductRow = memo(function ProductRow({
  prod, rowIdx, mesData, stock, savingCellMes, isSavingStock,
  mesesVisibles, maxConsumo, wideNombre, pref,
  onCellChange, onStockChange, onToggleWideNombre, onSetPref,
}: ProductRowProps) {
  const isEven = rowIdx % 2 === 0
  const rowBg = prod.activo === 0 ? "#fafafa" : isEven ? "#fff" : "#f8fafc"
  const rowBgHover = prod.activo === 0 ? "#fafafa" : "#eef2ff"

  function getBase(mes: number) { return mesData?.get(mes) ?? 0 }

  const totalProdBase = mesesVisibles.reduce((sum, idx) => sum + getBase(idx + 1), 0)
  const upc = prod.uds_por_caja && prod.uds_por_caja > 1 ? prod.uds_por_caja : null

  return (
    <tr
      style={{ borderBottom: "1px solid #f1f5f9", backgroundColor: rowBg }}
      onMouseEnter={e => { if (prod.activo !== 0) e.currentTarget.style.backgroundColor = rowBgHover }}
      onMouseLeave={e => { if (prod.activo !== 0) e.currentTarget.style.backgroundColor = rowBg }}
    >
      {/* Referencia */}
      <td style={{ ...tdStyle, width: "90px" }}>
        <div style={{ padding: "10px 16px", fontSize: "11px", fontWeight: 700, color: prod.activo === 0 ? "#9ca3af" : "#1d4ed8" }}>
          {prod.referencia}
        </div>
      </td>

      {/* Nombre */}
      <td onClick={onToggleWideNombre} style={{ ...tdStyle, padding: 0, position: "sticky", left: 0, zIndex: 3, width: wideNombre ? "320px" : "240px", minWidth: wideNombre ? "320px" : "240px", backgroundColor: rowBg, transition: "width 0.2s", cursor: "pointer" }}>
        <div style={{ padding: "10px 16px", fontSize: "13px", color: prod.activo === 0 ? "#9ca3af" : "#1f2937", fontWeight: prod.activo === 0 ? 400 : 500 }}>
          {prod.nombre}
          {prod.activo === 0 && (
            <span style={{ marginLeft: "6px", fontSize: "9px", padding: "1px 4px", borderRadius: "4px", backgroundColor: "#f3f4f6", color: "#6b7280", border: "1px solid #e5e7eb" }}>INACT.</span>
          )}
        </div>
      </td>

      {/* Tipo + Precio + toggle caja/uds */}
      <td style={{ ...tdStyle, padding: 0, position: "sticky", left: wideNombre ? "320px" : "240px", zIndex: 3, width: "200px", minWidth: "200px", backgroundColor: rowBg, boxShadow: "2px 0 4px -2px rgba(0,0,0,0.1)", transition: "left 0.2s" }}>
        {(() => {
          const mostrarBadge = prod.tipo_producto !== "CAJA" || upc === null
          const precioLabel = (() => {
            if (prod.tipo_producto === "CAJA" && upc) {
              if (prod.precio == null) return "—"
              if (pref === "unidad") {
                const pu = prod.precio / upc
                return `${pu.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/ud`
              }
              return `${prod.precio.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/caja`
            }
            return labelPrecio(prod.precio, prod.tipo_producto, prod.uds_por_caja)
          })()
          return (
            <div style={{ padding: "6px 12px", display: "flex", flexDirection: "column", gap: "4px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                {mostrarBadge && <TipoBadge tipo={prod.tipo_producto} />}
                <span style={{ fontSize: "12px", fontWeight: 600, color: prod.precio != null ? "#059669" : "#9ca3af" }}>
                  {precioLabel}
                </span>
              </div>
              {prod.tipo_producto === "CAJA" && (
                upc !== null
                  ? <PresToggle value={pref} onChange={v => onSetPref(prod.id, v)} />
                  : <span style={{ fontSize: "10px", color: "#f97316", fontWeight: 600 }}>⚠ Configura uds/caja</span>
              )}
            </div>
          )
        })()}
      </td>

      {/* Stock */}
      <td style={{ ...tdStyle, padding: "4px 8px", textAlign: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
          <input
            type="number"
            min="0"
            value={stock ?? ""}
            onChange={e => onStockChange(prod, e.target.value)}
            disabled={isSavingStock}
            placeholder="0"
            title={`Stock en unidades base${prod.tipo_producto === "CAJA" ? ` (${prod.uds_por_caja ?? 1} uds/caja)` : ""}`}
            style={{
              width: "64px", padding: "4px 6px", border: "1.5px solid #d1d5db",
              borderRadius: "6px", textAlign: "center", fontSize: "12px",
              backgroundColor: isSavingStock ? "#f5f5f5"
                : stock == null ? "#fff"
                : stock === 0 ? "#fef2f2"
                : stock <= (prod.uds_por_caja ?? 5) ? "#fff7ed"
                : "#f0fdf4",
              color: (isSavingStock || stock == null) ? "#9ca3af"
                : stock === 0 ? "#dc2626"
                : stock <= (prod.uds_por_caja ?? 5) ? "#c2410c"
                : "#15803d",
              fontWeight: stock != null ? 600 : 400,
              outline: "none",
            }}
          />
          {stock != null && stock > 0 && (
            <span style={{ fontSize: "9px", color: "#94a3b8", fontWeight: 500, whiteSpace: "nowrap" }}>
              {stockVisible(stock, prod.tipo_producto, prod.uds_por_caja)}
            </span>
          )}
        </div>
      </td>

      {/* Celdas de meses */}
      {mesesVisibles.map(idx => {
        const mes = idx + 1
        const valorBase = getBase(mes)
        const valorDisplay = prod.tipo_producto === "CAJA" && pref === "caja" && upc
          ? valorBase / upc
          : valorBase
        const isSaving = savingCellMes === mes
        const bgColor = getConsumoColor(valorBase, maxConsumo)
        const textColor = getConsumoTextColor(valorBase)

        return (
          <td key={mes} style={{ padding: "4px", textAlign: "center", backgroundColor: bgColor }}>
            <input
              type="number"
              min="0"
              step="1"
              value={valorDisplay > 0 ? valorDisplay : ""}
              placeholder="0"
              onChange={e => onCellChange(prod, mes, e.target.value)}
              disabled={isSaving}
              style={{
                width: "60px", padding: "4px", border: "1px solid #d1d5db", borderRadius: "4px",
                textAlign: "center", fontSize: "12px",
                backgroundColor: isSaving ? "#f5f5f5" : "rgba(255,255,255,0.92)",
                color: textColor,
                fontWeight: valorBase > 0 ? 600 : 400,
                cursor: "pointer", outline: "none",
                boxShadow: valorBase > 0 ? "0 0 0 1px rgba(34,197,94,0.25)" : "none",
                borderColor: valorBase > 0 ? "#93c5fd" : "#d1d5db",
              }}
              onMouseEnter={e => {
                if (!isSaving) {
                  e.currentTarget.style.borderColor = "#3b82f6"
                  e.currentTarget.style.boxShadow = `0 0 0 2px ${valorBase > 0 ? "rgba(59,130,246,0.2)" : "rgba(59,130,246,0.12)"}`
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = valorBase > 0 ? "#93c5fd" : "#d1d5db"
                e.currentTarget.style.boxShadow = valorBase > 0 ? "0 0 0 1px rgba(34,197,94,0.25)" : "none"
              }}
            />
          </td>
        )
      })}

      {/* Total */}
      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, fontSize: "13px", color: "#059669", backgroundColor: totalProdBase > 0 ? "#ecfdf5" : "transparent" }}>
        {totalProdBase > 0 ? stockVisible(totalProdBase, prod.tipo_producto, prod.uds_por_caja) : "—"}
      </td>
    </tr>
  )
})
