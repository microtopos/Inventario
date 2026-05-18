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


// ─── Export / Import JSON ─────────────────────────────────────────────────────

export interface ProductoExportado {
  codigo: string | null
  nombre: string
  departamento: string | null
  precio: number | null
  color: string | null
  tallas: { talla: string; stock: number }[]
}

export interface InventarioJSON {
  version: number
  exportadoEn: string
  productos: ProductoExportado[]
}

export async function exportInventarioJSON(): Promise<InventarioJSON> {
  const db = await getDB()

  const productos: any[] = await db.select(`
    SELECT p.id, p.codigo, p.nombre, p.precio, p.color, d.nombre AS departamento
    FROM productos p
    LEFT JOIN departamentos d ON d.id = p.departamento_id
    ORDER BY p.nombre
  `) as any[]

  const result: ProductoExportado[] = []

  for (const p of productos) {
    const tallas: any[] = await db.select(
      "SELECT talla, stock FROM tallas WHERE producto_id = ? ORDER BY talla",
      [p.id]
    ) as any[]

    result.push({
      codigo: p.codigo ?? null,
      nombre: p.nombre,
      departamento: p.departamento ?? null,
      precio: p.precio ?? null,
      color: p.color ?? null,
      tallas: tallas.map(t => ({ talla: t.talla, stock: t.stock })),
    })
  }

  return {
    version: 1,
    exportadoEn: new Date().toISOString(),
    productos: result,
  }
}

export interface ImportResult {
  creados: number
  omitidos: number
  errores: string[]
}

/**
 * Importa productos desde un objeto InventarioJSON.
 * - Si ya existe un producto con el mismo código (o mismo nombre si no hay código), lo omite.
 * - Crea los departamentos y colores que no existan.
 */
export async function importInventarioJSON(data: InventarioJSON): Promise<ImportResult> {
  const db = await getDB()
  const result: ImportResult = { creados: 0, omitidos: 0, errores: [] }

  for (const p of data.productos) {
    try {
      // Comprobar duplicado por código o por nombre
      let existe = false
      if (p.codigo) {
        const rows: any = await db.select(
          "SELECT id FROM productos WHERE codigo = ?", [p.codigo]
        )
        existe = rows.length > 0
      } else {
        const rows: any = await db.select(
          "SELECT id FROM productos WHERE nombre = ? AND codigo IS NULL", [p.nombre]
        )
        existe = rows.length > 0
      }

      if (existe) {
        result.omitidos++
        continue
      }

      // Resolver departamento
      let departamentoId: number | null = null
      if (p.departamento) {
        await db.execute(
          "INSERT OR IGNORE INTO departamentos (nombre) VALUES (?)", [p.departamento.trim()]
        )
        const dRow: any = await db.select(
          "SELECT id FROM departamentos WHERE nombre = ?", [p.departamento.trim()]
        )
        departamentoId = dRow[0]?.id ?? null
      }

      // Resolver color
      if (p.color) {
        await db.execute(
          "INSERT OR IGNORE INTO colores (nombre) VALUES (?)", [p.color.trim()]
        )
      }

      // Insertar producto
      await db.execute(
        "INSERT INTO productos (codigo, nombre, departamento_id, precio, color) VALUES (?, ?, ?, ?, ?)",
        [p.codigo ?? null, p.nombre, departamentoId, p.precio ?? null, p.color ?? null]
      )

      const idRow: any = await db.select("SELECT last_insert_rowid() as id")
      const productoId = idRow[0].id as number

      // Insertar tallas
      for (const t of p.tallas) {
        await db.execute(
          "INSERT OR IGNORE INTO tallas (producto_id, talla, stock) VALUES (?, ?, ?)",
          [productoId, t.talla, t.stock]
        )
        if (t.stock !== 0) {
          await db.execute(
            "INSERT INTO movimientos (talla_id, cambio, origen) VALUES (?, ?, 'pedido')",
            [(await db.select("SELECT id FROM tallas WHERE producto_id = ? AND talla = ?", [productoId, t.talla]) as any)[0].id, t.stock]
          )
        }
      }

      result.creados++
    } catch (e: any) {
      result.errores.push(`"${p.nombre}": ${e?.message ?? String(e)}`)
    }
  }

  return result
}