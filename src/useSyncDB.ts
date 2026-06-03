import { useState, useEffect } from "react"
import { invoke } from "@tauri-apps/api/core"

const PUSH_INTERVAL_MS = 5 * 60_000  // backup cada 5 min

export type SyncState = "syncing" | "ok" | "offline" | "no_network"

export interface SyncStatus {
  state: SyncState
  lastSync: Date | null  // última vez que el push completó con éxito
}

export function useSyncDB(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>({ state: "no_network", lastSync: null })

  useEffect(() => {
    let cancelled = false
    let isPushing = false

    async function doPush() {
      if (cancelled || isPushing) return
      isPushing = true
      setStatus(prev => ({ ...prev, state: "syncing" }))
      try {
        const result = await invoke<string>("push_to_network")
        if (cancelled) return
        if (result === "pushed") {
          setStatus({ state: "ok", lastSync: new Date() })
        } else if (result === "no_network_configured") {
          setStatus(prev => ({ ...prev, state: "no_network" }))
        } else {
          // "network_unreachable" u otro valor
          setStatus(prev => ({ ...prev, state: "offline" }))
        }
      } catch {
        if (!cancelled) setStatus(prev => ({ ...prev, state: "offline" }))
      } finally {
        isPushing = false
      }
    }

    const initialTimer = setTimeout(doPush, 5_000)
    const interval = setInterval(doPush, PUSH_INTERVAL_MS)

    // Intento de push al cerrar — sin checkpoint (no hay tiempo para async)
    const handleBeforeUnload = () => { invoke("push_to_network").catch(() => {}) }
    window.addEventListener("beforeunload", handleBeforeUnload)

    return () => {
      cancelled = true
      clearTimeout(initialTimer)
      clearInterval(interval)
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [])

  return status
}
