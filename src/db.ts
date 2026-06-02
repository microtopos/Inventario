import Database from "@tauri-apps/plugin-sql"

let dbInstance: Database | null = null

export async function getDB(): Promise<Database> {
  if (!dbInstance) {
    dbInstance = await Database.load("sqlite:inventario.db")
  }
  return dbInstance
}

export function resetDBInstance(): void {
  dbInstance = null
}
