import { useCallback, useEffect, useRef, useState } from "react"
import { useToast } from "./Toast"

interface RunOptions {
  /** Título del toast de error si la acción falla */
  errorTitle: string
  /**
   * Si es true, ignora llamadas concurrentes mientras ya hay una en curso.
   * Por defecto: true.
   */
  preventConcurrent?: boolean
}

interface UseAsyncActionResult {
  loading: boolean
  run: (fn: () => Promise<void>, opts: RunOptions) => Promise<void>
}

/**
 * Encapsula el patrón recurrente de:
 *  - guard de concurrencia (ref)
 *  - setLoading true/false
 *  - try/catch con toast.error automático
 *  - comprobación de montado antes de actualizar estado
 *
 * Uso:
 *   const { loading, run } = useAsyncAction()
 *   await run(() => receiveItem(id), { errorTitle: "No se pudo recibir" })
 */
export function useAsyncAction(): UseAsyncActionResult {
  const [loading, setLoading] = useState(false)
  const inFlightRef = useRef(false)
  const mountedRef = useRef(true)
  const toast = useToast()

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const run = useCallback(async (
    fn: () => Promise<void>,
    { errorTitle, preventConcurrent = true }: RunOptions
  ) => {
    if (preventConcurrent && inFlightRef.current) return
    inFlightRef.current = true
    if (mountedRef.current) setLoading(true)
    try {
      await fn()
    } catch (e: any) {
      toast.error(errorTitle, e?.message ?? String(e))
    } finally {
      inFlightRef.current = false
      if (mountedRef.current) setLoading(false)
    }
  }, [toast])

  return { loading, run }
}
