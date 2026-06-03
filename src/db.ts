import Database from "@tauri-apps/plugin-sql"

let dbInstance: Database | null = null

export async function getDB(): Promise<Database> {
  if (!dbInstance) {
    dbInstance = await Database.load("sqlite:inventario.db")
    await dbInstance.execute("PRAGMA foreign_keys = ON")
    await dbInstance.execute("PRAGMA busy_timeout = 10000")
  }
  return dbInstance
}

export function resetDBInstance(): void {
  dbInstance = null
}
