import { getDB } from "./db"
import { deleteProductImage } from "./imageService"

export async function getProductSizes(productId: number): Promise<any[]> {
  const db = await getDB()
  const rows: any = await db.select(`
    SELECT id, talla, stock
    FROM tallas
    WHERE producto_id = ?
    ORDER BY talla
  `, [productId])
  return rows as any[]
}

export async function updateStock(tallaId: number, stock: number) {
  const db = await getDB()
  const current = await db.select("SELECT stock FROM tallas WHERE id = ?", [tallaId])
  const oldStock = (current as any)[0].stock
  const diff = stock - oldStock
  await db.execute("UPDATE tallas SET stock = ? WHERE id = ?", [stock, tallaId])
  await db.execute("INSERT INTO movimientos (talla_id, cambio) VALUES (?, ?)", [tallaId, diff])
}

export async function createProduct(nombre: string, codigo: string, departamento: number, precio: number | null = null) {
  const db = await getDB()
  await db.execute(
    `INSERT INTO productos (codigo, nombre, departamento_id, precio) VALUES (?, ?, ?, ?)`,
    [codigo || null, nombre, departamento, precio ?? null]
  )
}

export async function deleteProduct(productId: number) {
  const db = await getDB()
  await deleteProductImage(productId).catch((e) => console.error("Error borrando imagen:", e))
  await db.execute(
    "DELETE FROM movimientos WHERE talla_id IN (SELECT id FROM tallas WHERE producto_id = ?)",
    [productId]
  )
  await db.execute("DELETE FROM tallas WHERE producto_id = ?", [productId])
  await db.execute("DELETE FROM productos WHERE id = ?", [productId])
}

export async function getDepartments(): Promise<any[]> {
  const db = await getDB()
  const rows: any = await db.select("SELECT id, nombre FROM departamentos ORDER BY nombre")
  return rows as any[]
}

export async function addDepartment(nombre: string): Promise<number> {
  const db = await getDB()
  await db.execute("INSERT OR IGNORE INTO departamentos (nombre) VALUES (?)", [nombre.trim()])
  const row: any = await db.select("SELECT id FROM departamentos WHERE nombre = ?", [nombre.trim()])
  return row[0].id
}

export async function addStock(tallaId: number, cantidad: number, origen: "manual" | "pedido" = "manual") {
  const db = await getDB()
  const row: any = await db.select("SELECT stock FROM tallas WHERE id = ?", [tallaId])
  const nuevoStock = row[0].stock + cantidad
  await db.execute("UPDATE tallas SET stock = ? WHERE id = ?", [nuevoStock, tallaId])
  await db.execute(
    "INSERT INTO movimientos (talla_id, cambio, origen) VALUES (?, ?, ?)",
    [tallaId, cantidad, origen]
  )
}

/**
 * Igual que addStock pero devuelve el ID del movimiento creado.
 * Usado para poder deshacer el ajuste inmediatamente después.
 */
export async function addStockWithId(
  tallaId: number,
  cantidad: number,
  origen: "manual" | "pedido" = "manual"
): Promise<number> {
  const db = await getDB()
  const row: any = await db.select("SELECT stock FROM tallas WHERE id = ?", [tallaId])
  const nuevoStock = row[0].stock + cantidad
  await db.execute("UPDATE tallas SET stock = ? WHERE id = ?", [nuevoStock, tallaId])
  await db.execute(
    "INSERT INTO movimientos (talla_id, cambio, origen) VALUES (?, ?, ?)",
    [tallaId, cantidad, origen]
  )
  const idRow: any = await db.select("SELECT last_insert_rowid() as id")
  return idRow[0].id as number
}

/**
 * Deshace una lista de movimientos: borra los registros y revierte el stock.
 * Solo debe llamarse con IDs de movimientos recién creados (undo inmediato).
 */
export async function undoMovimientos(movimientoIds: number[]): Promise<void> {
  if (movimientoIds.length === 0) return
  const db = await getDB()
  for (const movId of movimientoIds) {
    const rows: any = await db.select(
      "SELECT talla_id, cambio FROM movimientos WHERE id = ?",
      [movId]
    )
    if (!rows || rows.length === 0) continue
    const { talla_id, cambio } = rows[0]
    await db.execute(
      "UPDATE tallas SET stock = stock - ? WHERE id = ?",
      [cambio, talla_id]
    )
    await db.execute("DELETE FROM movimientos WHERE id = ?", [movId])
  }
}

export async function updateProduct(
  productId: number,
  fields: { nombre: string; codigo: string; departamento_id: number | null; precio: number | null }
) {
  const db = await getDB()
  await db.execute(
    "UPDATE productos SET nombre = ?, codigo = ?, departamento_id = ?, precio = ? WHERE id = ?",
    [fields.nombre || null, fields.codigo || null, fields.departamento_id, fields.precio ?? null, productId]
  )
}

export async function updateProductColor(productId: number, color: string) {
  const db = await getDB()
  await db.execute("UPDATE productos SET color = ? WHERE id = ?", [color || null, productId])
}

export async function getColors(): Promise<string[]> {
  const db = await getDB()
  const rows: any = await db.select("SELECT nombre FROM colores ORDER BY nombre")
  return rows.map((r: any) => r.nombre)
}

export async function addColor(nombre: string): Promise<void> {
  const db = await getDB()
  await db.execute("INSERT OR IGNORE INTO colores (nombre) VALUES (?)", [nombre.trim()])
}

export async function getProductMovementsCount(productId: number): Promise<number> {
  const db = await getDB()
  const rows: any = await db.select(`
    SELECT COUNT(*) as total
    FROM movimientos m
    JOIN tallas t ON t.id = m.talla_id
    WHERE t.producto_id = ?
  `, [productId])
  return rows[0].total as number
}

export async function getProductMovements(productId: number, limit = 50, offset = 0) {
  const db = await getDB()
  const rows = await db.select(`
    SELECT
      m.id,
      m.cambio,
      m.fecha,
      m.origen,
      t.talla
    FROM movimientos m
    JOIN tallas t ON t.id = m.talla_id
    WHERE t.producto_id = ?
    ORDER BY m.fecha DESC
    LIMIT ? OFFSET ?
  `, [productId, limit, offset])
  return rows
}

// ─── Tallas ───────────────────────────────────────────────────────────────────

/**
 * Añade una talla al producto con stock 0.
 * Usa INSERT OR IGNORE para que sea idempotente.
 */
export async function addTallaToProduct(productId: number, talla: string): Promise<void> {
  const db = await getDB()
  await db.execute(
    "INSERT OR IGNORE INTO tallas (producto_id, talla, stock) VALUES (?, ?, 0)",
    [productId, talla.trim()]
  )
}

/**
 * Elimina una talla y todos sus movimientos asociados.
 */
export async function deleteTalla(tallaId: number): Promise<void> {
  const db = await getDB()
  await db.execute("DELETE FROM movimientos WHERE talla_id = ?", [tallaId])
  await db.execute("DELETE FROM tallas WHERE id = ?", [tallaId])
}
