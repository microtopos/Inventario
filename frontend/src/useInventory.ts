import { useCallback, useEffect, useState } from "react"
import { getInventory } from "./inventoryService"
import { getImageUrlSync, preloadImages } from "./getImageUrl"
import { getDepartments } from "./productService"
import type { StockThresholds } from "./settingsService"

export interface InventoryItem {
  id: number
  codigo: string | null
  nombre: string
  departamento_id: number | null
  departamento: string | null
  color: string | null
  stock: number
  min_stock: number | null
  imageUrl: string
}

export interface Department {
  id: number
  nombre: string
}

interface UseInventoryOptions {
  stockThresholds: StockThresholds
}

interface UseInventoryResult {
  // Datos crudos
  inventory: InventoryItem[]
  departments: Department[]
  loading: boolean

  // Filtros
  search: string
  setSearch: (v: string) => void
  departmentFilter: number | null
  setDepartmentFilter: (id: number | null) => void
  showLowStock: boolean
  setShowLowStock: (v: boolean) => void

  // Vista filtrada y ordenada (lista final para renderizar)
  visible: InventoryItem[]

  // Estadísticas derivadas
  totalUnits: number
  lowStockCount: number

  // Acciones
  reload: () => Promise<void>
}

export function useInventory({ stockThresholds }: UseInventoryOptions): UseInventoryResult {
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState("")
  const [departmentFilter, setDepartmentFilter] = useState<number | null>(null)
  const [showLowStock, setShowLowStock] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getInventory()
      await preloadImages(data.map((p: any) => p.id))
      const items: InventoryItem[] = data.map((p: any) => ({
        ...p,
        imageUrl: getImageUrlSync(p.id),
      }))
      setInventory(items)
    } finally {
      setLoading(false)
    }
  }, [])

  // Carga inicial: departamentos e inventario en paralelo
  useEffect(() => {
    async function init() {
      const [deps] = await Promise.all([
        getDepartments(),
        reload(),
      ])
      setDepartments(deps as Department[])
    }
    init()
  }, [reload])

  // Vista derivada: filtrado
  const visible: InventoryItem[] = inventory.filter(p => {
    const matchesSearch =
      p.nombre.toLowerCase().includes(search.toLowerCase()) ||
      (p.codigo ?? "").toLowerCase().includes(search.toLowerCase())
    const matchesDept =
      departmentFilter === null || p.departamento_id === departmentFilter
    const matchesLow =
      !showLowStock || (p.min_stock !== null && p.min_stock <= stockThresholds.red)
    return matchesSearch && matchesDept && matchesLow
  })

  // Estadísticas
  const totalUnits = inventory.reduce((s, p) => s + (p.stock || 0), 0)
  const lowStockCount = inventory.filter(
    p => p.min_stock !== null && p.min_stock <= stockThresholds.red
  ).length

  return {
    inventory,
    departments,
    loading,
    search,
    setSearch,
    departmentFilter,
    setDepartmentFilter,
    showLowStock,
    setShowLowStock,
    visible,
    totalUnits,
    lowStockCount,
    reload,
  }
}
