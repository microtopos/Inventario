import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import { getDraftProductCount, loadDraft, syncDraft, discardDraft } from "./orderService"

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface DraftContextValue {
  /** Número de productos distintos en el borrador (para el badge del header) */
  draftCount: number
  /** Items del borrador: { tallaId: cantidad } */
  draftItems: Record<number, number>
  /** Notas del borrador */
  draftNotas: string
  /** ID del borrador en BD (null si no existe aún) */
  draftId: number | null
  /** Estado de sincronización con la BD */
  syncState: "idle" | "saving" | "saved" | "error"
  /** true cuando la carga inicial desde BD ha terminado */
  loaded: boolean

  /** Actualiza items y notas en memoria — la sync a BD ocurre con debounce */
  setDraft: (items: Record<number, number>, notas: string) => void
  /** Fuerza la sync inmediata y devuelve el id del borrador */
  flushSync: () => Promise<number | null>
  /**
   * Solo limpia el estado en memoria sin tocar la BD.
   * Usar tras confirmDraft(), cuando el pedido ya fue procesado.
   */
  clearState: () => void
  /** Descarta el borrador (borra de BD y limpia estado) */
  discard: () => Promise<void>
  /** Recarga el contador desde BD (útil tras confirmar un pedido) */
  refreshCount: () => Promise<void>
}

// ── Contexto ──────────────────────────────────────────────────────────────────

const DraftContext = createContext<DraftContextValue | null>(null)

export function useDraft(): DraftContextValue {
  const ctx = useContext(DraftContext)
  if (!ctx) throw new Error("useDraft debe usarse dentro de <DraftProvider>")
  return ctx
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function DraftProvider({ children }: { children: React.ReactNode }) {
  const [draftId, setDraftId] = useState<number | null>(null)
  const [draftItems, setDraftItems] = useState<Record<number, number>>({})
  const [draftNotas, setDraftNotas] = useState("")
  const [draftCount, setDraftCount] = useState(0)
  const [syncState, setSyncState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [loaded, setLoaded] = useState(false)

  const draftIdRef = useRef<number | null>(null)
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Flag para no sincronizar durante la carga inicial
  const initializedRef = useRef(false)

  // Carga inicial desde BD
  useEffect(() => {
    async function init() {
      const draft = await loadDraft()
      if (draft) {
        draftIdRef.current = draft.id
        setDraftId(draft.id)
        setDraftItems(draft.items)
        setDraftNotas(draft.notas ?? "")
        // Calcular count desde los items cargados
        const count = await getDraftProductCount()
        setDraftCount(count)
      }
      initializedRef.current = true
      setLoaded(true)
    }
    init()
  }, [])

  // Sincronización con debounce cada vez que cambian items o notas
  useEffect(() => {
    if (!initializedRef.current) return
    if (syncTimer.current) clearTimeout(syncTimer.current)
    setSyncState("saving")
    syncTimer.current = setTimeout(async () => {
      try {
        const newId = await syncDraft(draftIdRef.current, draftItems, draftNotas)
        draftIdRef.current = newId
        setDraftId(newId)
        setSyncState(newId !== null ? "saved" : "idle")
        // Actualizar badge
        const count = await getDraftProductCount()
        setDraftCount(count)
      } catch {
        setSyncState("error")
      }
    }, 600)
    return () => { if (syncTimer.current) clearTimeout(syncTimer.current) }
  }, [draftItems, draftNotas])

  const setDraft = useCallback((items: Record<number, number>, notas: string) => {
    setDraftItems(items)
    setDraftNotas(notas)
  }, [])

  const flushSync = useCallback(async (): Promise<number | null> => {
    if (syncTimer.current) { clearTimeout(syncTimer.current); syncTimer.current = null }
    try {
      const newId = await syncDraft(draftIdRef.current, draftItems, draftNotas)
      draftIdRef.current = newId
      setDraftId(newId)
      setSyncState(newId !== null ? "saved" : "idle")
      const count = await getDraftProductCount()
      setDraftCount(count)
      return newId
    } catch {
      setSyncState("error")
      return null
    }
  }, [draftItems, draftNotas])

  /** Solo limpia el estado en memoria — NO borra nada de BD */
  const clearState = useCallback(() => {
    if (syncTimer.current) { clearTimeout(syncTimer.current); syncTimer.current = null }
    draftIdRef.current = null
    setDraftId(null)
    setDraftItems({})
    setDraftNotas("")
    setDraftCount(0)
    setSyncState("idle")
  }, [])

  const discard = useCallback(async () => {
    if (syncTimer.current) { clearTimeout(syncTimer.current); syncTimer.current = null }
    const id = draftIdRef.current
    if (id !== null) {
      await discardDraft(id)
      draftIdRef.current = null
    }
    setDraftId(null)
    setDraftItems({})
    setDraftNotas("")
    setDraftCount(0)
    setSyncState("idle")
  }, [])

  const refreshCount = useCallback(async () => {
    const count = await getDraftProductCount()
    setDraftCount(count)
  }, [])

  return (
    <DraftContext.Provider value={{
      draftCount,
      draftItems,
      draftNotas,
      draftId,
      syncState,
      loaded,
      setDraft,
      flushSync,
      clearState,
      discard,
      refreshCount,
    }}>
      {children}
    </DraftContext.Provider>
  )
}
