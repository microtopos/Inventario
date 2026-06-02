import { createContext, useContext } from "react"
import type { SyncStatus } from "./useSyncDB"

interface AppShellContextValue {
  openHelp: () => void
  openSettings: () => void
  syncStatus: SyncStatus
}

export const AppShellContext = createContext<AppShellContextValue>({
  openHelp: () => {},
  openSettings: () => {},
  syncStatus: { state: "no_network", lastSync: null },
})

export function useAppShell() {
  return useContext(AppShellContext)
}
