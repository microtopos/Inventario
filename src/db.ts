import Database from "@tauri-apps/plugin-sql"
import { invoke } from "@tauri-apps/api/core"

let dbInstance: Database | null = null
let resolvedUrl: string | null = null

async function getDbUrl(): Promise<string> {
  if (resolvedUrl !== null) return resolvedUrl
  const customPath: string = await invoke("get_db_path")
  resolvedUrl = customPath ? `sqlite:${customPath}` : "sqlite:inventario.db"
  return resolvedUrl
}

export async function getDB(): Promise<Database> {
  const url = await getDbUrl()
  if (!dbInstance) {
    dbInstance = await Database.load(url)
  }
  return dbInstance
}

export function resetDBInstance(): void {
  dbInstance = null
  resolvedUrl = null
}
