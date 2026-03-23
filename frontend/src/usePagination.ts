import { useState, useCallback, useEffect, useRef } from "react"

interface UsePaginationOptions<T> {
  /** Función que recibe (pageSize, offset) y devuelve [items, total] */
  fetchFn: (pageSize: number, offset: number) => Promise<[T[], number]>
  /** Tamaño de página inicial */
  defaultPageSize?: number
  /** Si cambia, resetea a página 0 y recarga */
  deps?: React.DependencyList
}

interface UsePaginationResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  loading: boolean
  setPageSize: (size: number) => void
  goToPage: (page: number) => void
  reload: () => void
}

export function usePagination<T>({
  fetchFn,
  defaultPageSize = 25,
  deps = [],
}: UsePaginationOptions<T>): UsePaginationResult<T> {
  const [items, setItems] = useState<T[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSizeState] = useState(defaultPageSize)
  const [loading, setLoading] = useState(false)

  // Guardamos fetchFn en ref para que no sea una dependencia del efecto
  const fetchRef = useRef(fetchFn)
  useEffect(() => { fetchRef.current = fetchFn })

  const load = useCallback(async (p: number, ps: number) => {
    setLoading(true)
    try {
      const [data, count] = await fetchRef.current(ps, p * ps)
      setItems(data)
      setTotal(count)
    } finally {
      setLoading(false)
    }
  }, [])

  // Recarga cuando cambian las deps externas (filtros, rango de fechas…)
  // También se ejecuta en el montaje inicial
  useEffect(() => {
    setPage(0)
    load(0, pageSize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, pageSize])

  const goToPage = useCallback((p: number) => {
    setPage(p)
    load(p, pageSize)
  }, [load, pageSize])

  const setPageSize = useCallback((ps: number) => {
    setPageSizeState(ps)
    // El efecto de arriba se encargará de recargar con page=0
  }, [])

  const reload = useCallback(() => {
    load(page, pageSize)
  }, [load, page, pageSize])

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    loading,
    setPageSize,
    goToPage,
    reload,
  }
}
