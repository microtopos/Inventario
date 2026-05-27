import Database from "@tauri-apps/plugin-sql";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type TipoProducto = "UNIDAD" | "CAJA" | "FARDO"

export interface CategoriaProducto {
  id: number;
  nombre: string;
}

export interface ProductoAlmacen {
  id: number;
  referencia: string;
  nombre: string;
  categoria_id: number;
  categoria_nombre?: string;
  unidad_medida: string;         // legacy: label para mostrar en estadísticas
  activo: number;                // 1 | 0
  precio?: number | null;        // UNIDAD: €/ud · CAJA: €/caja · FARDO: €/fardo
  tipo_producto: TipoProducto;
  uds_por_caja?: number | null;  // solo relevante cuando tipo_producto = 'CAJA'
}

// ─── Helpers de presentación ──────────────────────────────────────────────────

/**
 * Convierte stock en unidades base a una cadena legible.
 * UNIDAD/FARDO → "N uds" / "N fardos"
 * CAJA        → "X cajas + Y uds" | "X cajas" | "Y uds"
 */
export function stockVisible(
  cantidad: number,
  tipo: TipoProducto,
  udsPorCaja?: number | null
): string {
  if (tipo === "FARDO") return `${cantidad} fardo${cantidad !== 1 ? "s" : ""}`
  if (tipo === "CAJA" && udsPorCaja && udsPorCaja > 1) {
    const cajas = Math.floor(cantidad / udsPorCaja)
    const resto = cantidad % udsPorCaja
    if (cajas > 0 && resto > 0) return `${cajas} caja${cajas !== 1 ? "s" : ""} + ${resto} uds`
    if (cajas > 0) return `${cajas} caja${cajas !== 1 ? "s" : ""}`
    return `${resto} uds`
  }
  return `${cantidad} uds`
}

/**
 * Precio por unidad base según el tipo de producto.
 * UNIDAD/FARDO → precio directamente
 * CAJA        → precio / uds_por_caja
 */
export function precioUnitario(
  precio: number | null | undefined,
  tipo: TipoProducto,
  udsPorCaja?: number | null
): number | null {
  if (precio == null) return null
  if (tipo === "CAJA" && udsPorCaja && udsPorCaja > 1) return precio / udsPorCaja
  return precio
}

/**
 * Label de precio para mostrar en el catálogo.
 * UNIDAD → "X,XX €/ud"  CAJA → "X,XX €/caja"  FARDO → "X,XX €/fardo"
 */
export function labelPrecio(
  precio: number | null | undefined,
  tipo: TipoProducto,
  udsPorCaja?: number | null
): string {
  if (precio == null) return "—"
  const fmt = precio.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (tipo === "CAJA") {
    const puLabel = udsPorCaja && udsPorCaja > 1
      ? ` (${(precio / udsPorCaja).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/ud)`
      : ""
    return `${fmt} €/caja${puLabel}`
  }
  if (tipo === "FARDO") return `${fmt} €/fardo`
  return `${fmt} €/ud`
}

/**
 * Clave localStorage para la preferencia de presentación de un producto en un departamento.
 * Solo relevante para tipo CAJA.
 * Valor: "caja" | "unidad"
 */
export function clavePreferenciaPres(productoId: number, departamentoId: number): string {
  return `pref_pres_${productoId}_${departamentoId}`
}

export function getPreferenciaPres(
  productoId: number,
  departamentoId: number
): "caja" | "unidad" {
  return (localStorage.getItem(clavePreferenciaPres(productoId, departamentoId)) as "caja" | "unidad") ?? "caja"
}

export function setPreferenciaPres(
  productoId: number,
  departamentoId: number,
  valor: "caja" | "unidad"
): void {
  localStorage.setItem(clavePreferenciaPres(productoId, departamentoId), valor)
}

// ─── Utilidades BD ────────────────────────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: Error | null = null

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error: any) {
      lastError = error
      const errorMsg = error?.message || String(error)
      const isLockError =
        errorMsg.includes("database is locked") ||
        errorMsg.includes("SQLITE_BUSY") ||
        errorMsg.includes("SQLITE_LOCKED") ||
        error?.code === 5
      if (!isLockError || i === maxRetries - 1) throw error
      const delay = 200 * Math.pow(2, i)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

async function getDb(): Promise<Database> {
  const db = await Database.load("sqlite:inventario.db")
  try {
    await db.execute("PRAGMA busy_timeout = 10000")
    await db.execute("PRAGMA journal_mode = WAL")
  } catch (_) { /* ignorar */ }
  return db
}

export async function getDbWithRetry(): Promise<Database> {
  return withRetry(getDb)
}

// ─── Tipos de apoyo ───────────────────────────────────────────────────────────

export interface DepartamentoProd {
  id: number;
  nombre: string;
}

export interface SalidaProducto {
  id: number;
  producto_id: number;
  departamento_id: number;
  /** Siempre en unidades base */
  cantidad: number;
  mes: number;
  anio: number;
  // join helpers
  producto_nombre?: string;
  producto_referencia?: string;
  unidad_medida?: string;
  departamento_nombre?: string;
  categoria_nombre?: string;
}

export interface NuevaSalida {
  producto_id: number;
  departamento_id: number;
  /** Siempre en unidades base */
  cantidad: number;
  mes: number;
  anio: number;
}

export interface FiltrosSalida {
  departamento_id?: number;
  producto_id?: number;
  categoria_id?: number;
  mes?: number;
  anio?: number;
  anio_desde?: number;
  anio_hasta?: number;
}

// ─── Categorías ───────────────────────────────────────────────────────────────

export async function getCategorias(): Promise<CategoriaProducto[]> {
  const db = await getDbWithRetry()
  return db.select<CategoriaProducto[]>(
    "SELECT * FROM categorias_producto ORDER BY nombre ASC"
  )
}

export async function crearCategoria(nombre: string): Promise<number> {
  const db = await getDbWithRetry()
  const result = await db.execute(
    "INSERT INTO categorias_producto (nombre) VALUES (?)",
    [nombre.trim()]
  )
  if (result.lastInsertId === undefined) throw new Error("No se pudo crear la categoría")
  return result.lastInsertId
}

export async function actualizarCategoria(id: number, nombre: string): Promise<void> {
  const db = await getDbWithRetry()
  await db.execute("UPDATE categorias_producto SET nombre = ? WHERE id = ?", [nombre.trim(), id])
}

export async function eliminarCategoria(id: number): Promise<void> {
  const db = await getDbWithRetry()
  const rows = await db.select<{ total: number }[]>(
    "SELECT COUNT(*) AS total FROM productos_almacen WHERE categoria_id = ? AND activo = 1",
    [id]
  )
  if (rows[0].total > 0) throw new Error("No se puede eliminar una categoría con productos activos.")
  await db.execute("DELETE FROM categorias_producto WHERE id = ?", [id])
}

// ─── Productos ────────────────────────────────────────────────────────────────

export async function getProductos(soloActivos = true): Promise<ProductoAlmacen[]> {
  const db = await getDbWithRetry()
  const where = soloActivos ? "WHERE p.activo = 1" : ""
  return db.select<ProductoAlmacen[]>(
    `SELECT
       p.id, p.referencia, p.nombre, p.categoria_id,
       c.nombre AS categoria_nombre,
       p.unidad_medida, p.activo, p.precio,
       p.tipo_producto, p.uds_por_caja
     FROM productos_almacen p
     JOIN categorias_producto c ON c.id = p.categoria_id
     ${where}
     ORDER BY c.nombre ASC, p.referencia ASC`
  )
}

export async function crearProducto(
  referencia: string,
  nombre: string,
  categoria_id: number,
  unidad_medida: string,
  tipo_producto: TipoProducto,
  uds_por_caja: number | null,
  precio?: number | null
): Promise<number> {
  const db = await getDbWithRetry()
  const result = await db.execute(
    `INSERT INTO productos_almacen
       (referencia, nombre, categoria_id, unidad_medida, tipo_producto, uds_por_caja, precio)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [referencia.trim(), nombre.trim(), categoria_id, unidad_medida.trim(), tipo_producto, uds_por_caja, precio ?? null]
  )
  if (result.lastInsertId === undefined) throw new Error("No se pudo crear el producto")
  return result.lastInsertId
}

export async function actualizarProducto(
  id: number,
  datos: Partial<Pick<ProductoAlmacen, "referencia" | "nombre" | "categoria_id" | "unidad_medida" | "precio" | "tipo_producto" | "uds_por_caja">>
): Promise<void> {
  const db = await getDbWithRetry()
  const campos: string[] = []
  const params: (string | number | null)[] = []

  if (datos.referencia    !== undefined) { campos.push("referencia = ?");     params.push(datos.referencia.trim()) }
  if (datos.nombre        !== undefined) { campos.push("nombre = ?");         params.push(datos.nombre.trim()) }
  if (datos.categoria_id  !== undefined) { campos.push("categoria_id = ?");   params.push(datos.categoria_id) }
  if (datos.unidad_medida !== undefined) { campos.push("unidad_medida = ?");  params.push(datos.unidad_medida.trim()) }
  if (datos.precio        !== undefined) { campos.push("precio = ?");         params.push(datos.precio ?? null) }
  if (datos.tipo_producto !== undefined) { campos.push("tipo_producto = ?");  params.push(datos.tipo_producto) }
  if (datos.uds_por_caja  !== undefined) { campos.push("uds_por_caja = ?");   params.push(datos.uds_por_caja ?? null) }

  if (campos.length === 0) return
  params.push(id)
  await db.execute(`UPDATE productos_almacen SET ${campos.join(", ")} WHERE id = ?`, params)
}

export async function desactivarProducto(id: number): Promise<void> {
  const db = await getDbWithRetry()
  await db.execute("UPDATE productos_almacen SET activo = 0 WHERE id = ?", [id])
}

export async function reactivarProducto(id: number): Promise<void> {
  const db = await getDbWithRetry()
  await db.execute("UPDATE productos_almacen SET activo = 1 WHERE id = ?", [id])
}

export async function deleteProduct(productId: number): Promise<void> {
  const db = await getDbWithRetry()
  await db.execute("DELETE FROM salidas_productos WHERE producto_id = ?", [productId])
  await db.execute("DELETE FROM producto_presentaciones WHERE producto_id = ?", [productId])
  await db.execute("DELETE FROM stock_productos WHERE producto_id = ?", [productId])
  await db.execute("DELETE FROM productos_almacen WHERE id = ?", [productId])
}

// ─── Departamentos ────────────────────────────────────────────────────────────

export async function getDepartamentosProd(): Promise<DepartamentoProd[]> {
  const db = await getDbWithRetry()
  return db.select<DepartamentoProd[]>("SELECT * FROM departamentos_prod ORDER BY nombre ASC")
}

export async function crearDepartamentoProd(nombre: string): Promise<number> {
  const db = await getDbWithRetry()
  const result = await db.execute(
    "INSERT INTO departamentos_prod (nombre) VALUES (?)",
    [nombre.trim()]
  )
  if (result.lastInsertId === undefined) throw new Error("No se pudo crear el departamento")
  return result.lastInsertId
}

export async function actualizarDepartamentoProd(id: number, nombre: string): Promise<void> {
  const db = await getDbWithRetry()
  await db.execute("UPDATE departamentos_prod SET nombre = ? WHERE id = ?", [nombre.trim(), id])
}

export async function eliminarDepartamentoProd(id: number): Promise<void> {
  const db = await getDbWithRetry()
  const rows = await db.select<{ total: number }[]>(
    "SELECT COUNT(*) AS total FROM salidas_productos WHERE departamento_id = ?",
    [id]
  )
  if (rows[0].total > 0) throw new Error("No se puede eliminar un departamento con salidas registradas.")
  await db.execute("DELETE FROM departamentos_prod WHERE id = ?", [id])
}

// ─── Stock ────────────────────────────────────────────────────────────────────

/**
 * Devuelve el stock actual de todos los productos.
 * Clave: producto_id → cantidad en unidades base.
 */
export async function getStockProductos(): Promise<Map<number, number>> {
  const db = await getDbWithRetry()
  const rows = await db.select<{ producto_id: number; cantidad: number }[]>(
    "SELECT producto_id, cantidad FROM stock_productos"
  )
  const mapa = new Map<number, number>()
  for (const row of rows) mapa.set(row.producto_id, row.cantidad)
  return mapa
}

/**
 * Establece el stock de un producto directamente (corrección manual).
 * Si cantidad = null, elimina el registro (stock desconocido).
 */
export async function upsertStock(
  productoId: number,
  cantidad: number | null
): Promise<void> {
  const db = await getDbWithRetry()
  if (cantidad === null) {
    await db.execute("DELETE FROM stock_productos WHERE producto_id = ?", [productoId])
    return
  }
  await db.execute(
    `INSERT INTO stock_productos (producto_id, cantidad, actualizado_el)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(producto_id)
     DO UPDATE SET cantidad = excluded.cantidad, actualizado_el = excluded.actualizado_el`,
    [productoId, cantidad]
  )
}

/**
 * Ajusta el stock de un producto sumando `delta` (puede ser negativo).
 * Si no existe registro previo, lo crea en 0 y aplica el delta.
 * El stock nunca baja de 0.
 */
export async function ajustarStock(
  productoId: number,
  delta: number
): Promise<void> {
  if (delta === 0) return
  const db = await getDbWithRetry()
  await db.execute(
    `INSERT INTO stock_productos (producto_id, cantidad, actualizado_el)
     VALUES (?, MAX(0, ?), datetime('now'))
     ON CONFLICT(producto_id)
     DO UPDATE SET
       cantidad       = MAX(0, cantidad + ?),
       actualizado_el = datetime('now')`,
    [productoId, delta, delta]
  )
}

// ─── Salidas ──────────────────────────────────────────────────────────────────

export async function getSalidas(filtros: FiltrosSalida = {}): Promise<SalidaProducto[]> {
  const db = await getDbWithRetry()
  const condiciones: string[] = []
  const params: (string | number)[] = []

  if (filtros.departamento_id) { condiciones.push("s.departamento_id = ?"); params.push(filtros.departamento_id) }
  if (filtros.producto_id)     { condiciones.push("s.producto_id = ?");     params.push(filtros.producto_id) }
  if (filtros.categoria_id)    { condiciones.push("p.categoria_id = ?");    params.push(filtros.categoria_id) }
  if (filtros.mes)             { condiciones.push("s.mes = ?");             params.push(filtros.mes) }
  if (filtros.anio)            { condiciones.push("s.anio = ?");            params.push(filtros.anio) }
  if (filtros.anio_desde)      { condiciones.push("s.anio >= ?");           params.push(filtros.anio_desde) }
  if (filtros.anio_hasta)      { condiciones.push("s.anio <= ?");           params.push(filtros.anio_hasta) }

  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(" AND ")}` : ""

  return db.select<SalidaProducto[]>(
    `SELECT
       s.id, s.producto_id, s.departamento_id, s.cantidad, s.mes, s.anio,
       p.nombre AS producto_nombre,
       p.referencia AS producto_referencia,
       p.unidad_medida,
       d.nombre AS departamento_nombre,
       c.nombre AS categoria_nombre
     FROM salidas_productos s
     JOIN productos_almacen p ON p.id = s.producto_id
     JOIN departamentos_prod d ON d.id = s.departamento_id
     JOIN categorias_producto c ON c.id = p.categoria_id
     ${where}
     ORDER BY s.anio DESC, s.mes DESC, p.referencia ASC`,
    params
  )
}

/**
 * Upsert de salida. La cantidad siempre es en unidades base.
 * Si cantidad = 0, elimina el registro.
 * Unicidad: (producto_id, departamento_id, mes, anio).
 *
 * Devuelve la cantidad anterior que había guardada (0 si no existía),
 * para que el llamador pueda calcular el delta y ajustar el stock.
 */
export async function upsertSalida(datos: NuevaSalida): Promise<number> {
  const db = await getDbWithRetry()

  // Sumar todas las filas del mismo (producto, departamento, mes, año) por si
  // quedaron duplicados legacy del schema antiguo (presentacion_id/tipo_unidad no nulos).
  const anterior = await db.select<{ cantidad: number }[]>(
    `SELECT COALESCE(SUM(cantidad), 0) AS cantidad FROM salidas_productos
     WHERE producto_id = ? AND departamento_id = ? AND mes = ? AND anio = ?`,
    [datos.producto_id, datos.departamento_id, datos.mes, datos.anio]
  )
  const cantidadAnterior = anterior[0]?.cantidad ?? 0

  if (datos.cantidad === 0) {
    await db.execute(
      `DELETE FROM salidas_productos
       WHERE producto_id = ? AND departamento_id = ? AND mes = ? AND anio = ?`,
      [datos.producto_id, datos.departamento_id, datos.mes, datos.anio]
    )
  } else {
    // Eliminar todas las filas existentes (incluidas legacy con presentacion_id/tipo_unidad),
    // luego insertar la fila canónica limpia con el nuevo schema.
    await db.execute(
      `DELETE FROM salidas_productos
       WHERE producto_id = ? AND departamento_id = ? AND mes = ? AND anio = ?`,
      [datos.producto_id, datos.departamento_id, datos.mes, datos.anio]
    )
    await db.execute(
      `INSERT INTO salidas_productos (producto_id, departamento_id, cantidad, mes, anio)
       VALUES (?, ?, ?, ?, ?)`,
      [datos.producto_id, datos.departamento_id, datos.cantidad, datos.mes, datos.anio]
    )
  }

  return cantidadAnterior
}

export async function eliminarSalida(id: number): Promise<void> {
  const db = await getDbWithRetry()
  await db.execute("DELETE FROM salidas_productos WHERE id = ?", [id])
}

export async function eliminarSalidasDepartamento(
  departamentoId: number,
  anio?: number
): Promise<number> {
  const db = await getDbWithRetry()

  // Calcular el total de unidades que se van a eliminar por producto,
  // para revertir el efecto en el stock.
  const condAnio = anio !== undefined ? "AND anio = ?" : ""
  const paramsAnio = anio !== undefined ? [departamentoId, anio] : [departamentoId]

  const totales = await db.select<{ producto_id: number; total: number }[]>(
    `SELECT producto_id, SUM(cantidad) AS total
     FROM salidas_productos
     WHERE departamento_id = ? ${condAnio}
     GROUP BY producto_id`,
    paramsAnio
  )

  const sql = anio !== undefined
    ? "DELETE FROM salidas_productos WHERE departamento_id = ? AND anio = ?"
    : "DELETE FROM salidas_productos WHERE departamento_id = ?"
  const params = anio !== undefined ? [departamentoId, anio] : [departamentoId]
  const result = await db.execute(sql, params)

  // Revertir el stock: devolver todas las unidades eliminadas
  for (const { producto_id, total } of totales) {
    await ajustarStock(producto_id, total) // positivo: devuelve unidades al stock
  }

  return result.rowsAffected ?? 0
}

// ─── Clave de mapa de salidas ─────────────────────────────────────────────────

export function claveSalida(productoId: number): string {
  return String(productoId)
}

/**
 * Carga todas las salidas de un año (y opcionalmente departamento)
 * y las devuelve como mapa: productoId → mes → cantidad (unidades base).
 */
export async function getSalidasByYear(
  year: number,
  departamentoId?: number
): Promise<Map<string, Map<number, number>>> {
  const db = await getDbWithRetry()
  const condiciones: string[] = ["s.anio = ?"]
  const params: (number | null)[] = [year]

  if (departamentoId !== undefined) {
    condiciones.push("s.departamento_id = ?")
    params.push(departamentoId)
  }

  const rows = await db.select<{
    producto_id: number;
    mes: number;
    cantidad: number;
  }[]>(
    `SELECT s.producto_id, s.mes, SUM(s.cantidad) AS cantidad
     FROM salidas_productos s
     WHERE ${condiciones.join(" AND ")}
     GROUP BY s.producto_id, s.mes
     ORDER BY s.producto_id, s.mes`,
    params
  )

  const resultado = new Map<string, Map<number, number>>()
  for (const row of rows) {
    const clave = claveSalida(row.producto_id)
    if (!resultado.has(clave)) resultado.set(clave, new Map())
    resultado.get(clave)!.set(row.mes, row.cantidad)
  }
  return resultado
}

export async function getAniosDisponibles(): Promise<number[]> {
  const db = await getDbWithRetry()
  const rows = await db.select<{ anio: number }[]>(
    "SELECT DISTINCT anio FROM salidas_productos ORDER BY anio DESC LIMIT 5"
  )
  const anios = rows.map(r => r.anio)
  // Asegurar que el año actual siempre está disponible
  const anioActual = new Date().getFullYear()
  if (!anios.includes(anioActual)) anios.unshift(anioActual)
  return anios
}

// ─── Estadísticas ─────────────────────────────────────────────────────────────

export interface ConsumoMensualDepartamento {
  anio: number;
  mes: number;
  departamento_id: number;
  departamento_nombre: string;
  total_cantidad: number;
}

export async function getConsumoMensualPorDepartamento(
  filtros: FiltrosSalida = {}
): Promise<ConsumoMensualDepartamento[]> {
  const db = await getDbWithRetry()
  const condiciones: string[] = []
  const params: (string | number)[] = []

  if (filtros.departamento_id) { condiciones.push("s.departamento_id = ?"); params.push(filtros.departamento_id) }
  if (filtros.categoria_id)    { condiciones.push("p.categoria_id = ?");    params.push(filtros.categoria_id) }
  if (filtros.anio_desde)      { condiciones.push("s.anio >= ?");           params.push(filtros.anio_desde) }
  if (filtros.anio_hasta)      { condiciones.push("s.anio <= ?");           params.push(filtros.anio_hasta) }

  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(" AND ")}` : ""

  return db.select<ConsumoMensualDepartamento[]>(
    `SELECT
       s.anio, s.mes,
       d.id   AS departamento_id,
       d.nombre AS departamento_nombre,
       SUM(s.cantidad) AS total_cantidad
     FROM salidas_productos s
     JOIN productos_almacen p ON p.id = s.producto_id
     JOIN departamentos_prod d ON d.id = s.departamento_id
     ${where}
     GROUP BY s.anio, s.mes, d.id, d.nombre
     ORDER BY s.anio ASC, s.mes ASC`,
    params
  )
}

export interface CostePorProducto {
  producto_id: number;
  producto_referencia: string;
  producto_nombre: string;
  categoria_nombre: string;
  coste_total: number;
}

export async function getCostePorProducto(
  filtros: FiltrosSalida = {}
): Promise<CostePorProducto[]> {
  const db = await getDbWithRetry()
  const condiciones: string[] = []
  const params: (string | number)[] = []

  if (filtros.departamento_id) { condiciones.push("s.departamento_id = ?"); params.push(filtros.departamento_id) }
  if (filtros.categoria_id)    { condiciones.push("p.categoria_id = ?");    params.push(filtros.categoria_id) }
  if (filtros.anio)            { condiciones.push("s.anio = ?");            params.push(filtros.anio) }
  if (filtros.anio_desde)      { condiciones.push("s.anio >= ?");           params.push(filtros.anio_desde) }
  if (filtros.anio_hasta)      { condiciones.push("s.anio <= ?");           params.push(filtros.anio_hasta) }

  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(" AND ")}` : ""

  return db.select<CostePorProducto[]>(
    `SELECT
       p.id   AS producto_id,
       p.referencia AS producto_referencia,
       p.nombre AS producto_nombre,
       c.nombre AS categoria_nombre,
       ROUND(SUM(
         s.cantidad * CASE
           WHEN p.tipo_producto = 'CAJA' AND p.uds_por_caja > 1
             THEN COALESCE(p.precio, 0) / p.uds_por_caja
           ELSE
             COALESCE(p.precio, 0)
         END
       ), 2) AS coste_total
     FROM salidas_productos s
     JOIN productos_almacen p ON p.id = s.producto_id
     JOIN categorias_producto c ON c.id = p.categoria_id
     ${where}
     GROUP BY p.id, p.referencia, p.nombre, c.nombre
     ORDER BY coste_total DESC`,
    params
  )
}

export interface CostePorDepartamento {
  departamento_id: number;
  departamento_nombre: string;
  coste_total: number;
}

export async function getCostePorDepartamento(
  filtros: FiltrosSalida = {}
): Promise<CostePorDepartamento[]> {
  const db = await getDbWithRetry()
  const condiciones: string[] = []
  const params: (string | number)[] = []

  if (filtros.departamento_id) { condiciones.push("s.departamento_id = ?"); params.push(filtros.departamento_id) }
  if (filtros.categoria_id)    { condiciones.push("p.categoria_id = ?");    params.push(filtros.categoria_id) }
  if (filtros.anio)            { condiciones.push("s.anio = ?");            params.push(filtros.anio) }
  if (filtros.anio_desde)      { condiciones.push("s.anio >= ?");           params.push(filtros.anio_desde) }
  if (filtros.anio_hasta)      { condiciones.push("s.anio <= ?");           params.push(filtros.anio_hasta) }

  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(" AND ")}` : ""

  return db.select<CostePorDepartamento[]>(
    `SELECT
       d.id AS departamento_id,
       d.nombre AS departamento_nombre,
       ROUND(SUM(
         s.cantidad * CASE
           WHEN p.tipo_producto = 'CAJA' AND p.uds_por_caja > 1
             THEN COALESCE(p.precio, 0) / p.uds_por_caja
           ELSE
             COALESCE(p.precio, 0)
         END
       ), 2) AS coste_total
     FROM salidas_productos s
     JOIN productos_almacen p ON p.id = s.producto_id
     JOIN departamentos_prod d ON d.id = s.departamento_id
     ${where}
     GROUP BY d.id, d.nombre
     ORDER BY coste_total DESC`,
    params
  )
}

// ─── Export / Import JSON (v3) ────────────────────────────────────────────────

export interface ProductoExportadoV3 {
  referencia: string;
  nombre: string;
  categoria_nombre: string;
  unidad_medida: string;
  activo: number;
  precio: number | null;
  tipo_producto: TipoProducto;
  uds_por_caja: number | null;
}

export interface SalidaExportadaV3 {
  departamento: string;
  producto_referencia: string;
  /** Siempre en unidades base */
  cantidad: number;
  mes: number;
  anio: number;
}

export interface ExportacionProductosV3 {
  version: 3;
  exportado_el: string;
  departamentos: string[];
  productos: ProductoExportadoV3[];
  salidas: SalidaExportadaV3[];
}

// Mantener compatibilidad de tipos con código legado que importa ExportacionProductos
export type ExportacionProductos = ExportacionProductosV3

export async function exportarProductosJSON(): Promise<ExportacionProductosV3> {
  const db = await getDbWithRetry()

  const productos = await db.select<ProductoExportadoV3[]>(
    `SELECT p.referencia, p.nombre, c.nombre AS categoria_nombre,
            p.unidad_medida, p.activo, p.precio, p.tipo_producto, p.uds_por_caja
     FROM productos_almacen p
     JOIN categorias_producto c ON c.id = p.categoria_id
     ORDER BY c.nombre ASC, p.referencia ASC`
  )

  const depts = await db.select<{ nombre: string }[]>(
    "SELECT nombre FROM departamentos_prod ORDER BY nombre ASC"
  )

  const salidas = await db.select<SalidaExportadaV3[]>(
    `SELECT
       d.nombre    AS departamento,
       p.referencia AS producto_referencia,
       s.cantidad, s.mes, s.anio
     FROM salidas_productos s
     JOIN departamentos_prod d ON d.id = s.departamento_id
     JOIN productos_almacen  p ON p.id = s.producto_id
     ORDER BY s.anio, s.mes, d.nombre, p.referencia`
  )

  return {
    version: 3,
    exportado_el: new Date().toISOString(),
    departamentos: depts.map(d => d.nombre),
    productos,
    salidas,
  }
}

export interface ResultadoImportacionJSON {
  importados: number;
  omitidos: number;
  salidasImportadas: number;
  departamentosImportados: number;
  errores: string[];
}

/**
 * Importa productos, departamentos y salidas desde un JSON exportado.
 * Compatible con formato v2 (legado) y v3 (nuevo).
 *
 * Reglas de precio:
 *  - v3: usa prod.precio si está presente en el JSON (puede ser null explícito).
 *        Si el campo no existe en el objeto, NO sobreescribe el precio existente.
 *  - v2: intenta extraer el precio de presentaciones[].precio como fallback.
 */
export async function importarProductosJSON(
  datos: any
): Promise<ResultadoImportacionJSON> {
  if (!Array.isArray(datos.productos)) {
    throw new Error("Formato de archivo JSON no reconocido.")
  }

  const resultado: ResultadoImportacionJSON = {
    importados: 0,
    omitidos: 0,
    salidasImportadas: 0,
    departamentosImportados: 0,
    errores: [],
  }

  // ── Departamentos ────────────────────────────────────────────────────────
  const deptosExistentes = await getDepartamentosProd()
  const deptNombreAId = new Map<string, number>(
    deptosExistentes.map(d => [d.nombre.toUpperCase(), d.id])
  )

  if (Array.isArray(datos.departamentos)) {
    for (const nombre of datos.departamentos as string[]) {
      if (!nombre?.trim()) continue
      const key = nombre.trim().toUpperCase()
      if (!deptNombreAId.has(key)) {
        try {
          const id = await crearDepartamentoProd(nombre.trim())
          deptNombreAId.set(key, id)
          resultado.departamentosImportados++
        } catch (e: any) {
          resultado.errores.push(`Depto "${nombre}": ${e?.message ?? String(e)}`)
        }
      }
    }
  }

  // ── Productos ────────────────────────────────────────────────────────────
  const refAId = new Map<string, number>()

  for (const prod of datos.productos) {
    try {
      if (!prod.referencia?.trim() || !prod.nombre?.trim()) {
        resultado.omitidos++
        continue
      }

      // Inferir tipo_producto y uds_por_caja para v2 (no tiene estos campos)
      let tipoProd: TipoProducto = prod.tipo_producto ?? "UNIDAD"
      let udsCaja: number | null = prod.uds_por_caja ?? null

      if (!prod.tipo_producto && Array.isArray(prod.presentaciones)) {
        type PresV2 = { unidad: string; precio?: number | null }
        const pres = prod.presentaciones as PresV2[]
        const nombres = pres.map(p => p.unidad?.toUpperCase())

        if (nombres.includes("FARDO")) {
          tipoProd = "FARDO"
        } else if (nombres.includes("CAJA")) {
          tipoProd = "CAJA"
          // Intentar inferir uds_por_caja desde el ratio precio_caja / precio_unidad
          const pCaja = pres.find(p => p.unidad?.toUpperCase() === "CAJA")?.precio ?? null
          const pUd   = pres.find(p => p.unidad?.toUpperCase() === "UNIDAD")?.precio ?? null
          if (pCaja && pUd && pUd > 0) {
            const ratio = pCaja / pUd
            const rounded = Math.round(ratio)
            // Solo usar si el ratio es un entero limpio (tolerancia 2%)
            if (Math.abs(ratio - rounded) / rounded < 0.02) {
              udsCaja = rounded
            }
          }
          // Si no se pudo inferir, queda NULL — el usuario lo rellena manualmente
        }
      }

      // Extraer precio:
      // - v3: el campo "precio" existe explícitamente en el objeto
      // - v2: intentar desde presentaciones[].precio como fallback
      let precioImport: number | null | undefined = undefined // undefined = no tocar
      if ("precio" in prod) {
        // Campo presente en el JSON → usar aunque sea null
        precioImport = prod.precio ?? null
      } else if (Array.isArray(prod.presentaciones)) {
        // Formato v2: buscar precio en las presentaciones
        const conPrecio = (prod.presentaciones as { precio?: number | null }[])
          .find(p => p.precio != null)
        if (conPrecio) precioImport = conPrecio.precio ?? null
      }

      const cats = await getCategorias()
      let catId: number
      const catExistente = cats.find(
        c => c.nombre.toUpperCase() === (prod.categoria_nombre || "SIN CATEGORÍA").toUpperCase()
      )
      catId = catExistente
        ? catExistente.id
        : await crearCategoria(prod.categoria_nombre || "SIN CATEGORÍA")

      const db2 = await getDbWithRetry()
      const existente = await db2.select<{ id: number }[]>(
        "SELECT id FROM productos_almacen WHERE referencia = ?",
        [prod.referencia.trim()]
      )

      let productoId: number
      if (existente.length > 0) {
        productoId = existente[0].id
        // Solo incluir precio en el update si el JSON lo trae explícitamente
        await actualizarProducto(productoId, {
          nombre: prod.nombre.trim(),
          categoria_id: catId,
          unidad_medida: prod.unidad_medida?.trim() || "UNIDAD",
          tipo_producto: tipoProd,
          uds_por_caja: udsCaja,
          ...(precioImport !== undefined ? { precio: precioImport } : {}),
        })
      } else {
        productoId = await crearProducto(
          prod.referencia.trim(),
          prod.nombre.trim(),
          catId,
          prod.unidad_medida?.trim() || "UNIDAD",
          tipoProd,
          udsCaja,
          precioImport !== undefined ? precioImport : null,
        )
      }

      refAId.set(prod.referencia.trim(), productoId)
      resultado.importados++
    } catch (e: any) {
      resultado.errores.push(`${prod.referencia}: ${e?.message ?? String(e)}`)
    }
  }

  // ── Salidas ──────────────────────────────────────────────────────────────
  if (Array.isArray(datos.salidas)) {
    // Leer uds_por_caja y tipo_producto de todos los productos importados de una vez
    const prodInfo = new Map<number, { uds_por_caja: number | null; tipo_producto: string }>()
    if (refAId.size > 0) {
      const db2 = await getDbWithRetry()
      const ids = Array.from(refAId.values())
      const placeholders = ids.map(() => "?").join(", ")
      const rows = await db2.select<{ id: number; uds_por_caja: number | null; tipo_producto: string }[]>(
        `SELECT id, uds_por_caja, tipo_producto FROM productos_almacen WHERE id IN (${placeholders})`,
        ids
      )
      for (const row of rows) prodInfo.set(row.id, { uds_por_caja: row.uds_por_caja, tipo_producto: row.tipo_producto })
    }

    for (const salida of datos.salidas) {
      try {
        const deptId = deptNombreAId.get(salida.departamento?.toUpperCase?.() ?? "")
        const prodId = refAId.get(salida.producto_referencia?.trim?.() ?? "")
        if (!deptId || !prodId) continue

        const info = prodInfo.get(prodId)
        const presentacionUnidad = salida.presentacion_unidad?.toUpperCase?.() ?? null

        // Conversión v2 → unidades base:
        // - CAJA: multiplicar por uds_por_caja (si se pudo inferir; si no, 1 como fallback)
        // - FARDO: la unidad base de FARDO es el fardo mismo — sin conversión
        // - UNIDAD / null: sin conversión
        let cantidad: number = salida.cantidad
        if (presentacionUnidad === "CAJA") {
          const upc = info?.uds_por_caja ?? null
          if (upc && upc > 1) {
            cantidad = Math.round(salida.cantidad * upc)
          }
          // Si upc es null (no se pudo inferir), guardamos la cantidad tal cual
          // y anotamos un warning no bloqueante
          if (!upc) {
            resultado.errores.push(
              `⚠ ${salida.producto_referencia} mes ${salida.mes}/${salida.anio}: salida en CAJA importada sin convertir (uds/caja desconocidas)`
            )
          }
        }
        // FARDO y UNIDAD: cantidad ya está en unidades base

        const cantidadAnterior = await upsertSalida({
          producto_id: prodId,
          departamento_id: deptId,
          cantidad,
          mes: salida.mes,
          anio: salida.anio,
        })

        const delta = cantidadAnterior - cantidad
        await ajustarStock(prodId, delta)

        resultado.salidasImportadas++
      } catch (e: any) {
        resultado.errores.push(
          `Salida ${salida.producto_referencia} mes ${salida.mes}/${salida.anio}: ${e?.message ?? String(e)}`
        )
      }
    }
  }

  return resultado
}

// ─── Resumen por departamento ─────────────────────────────────────────────────

export interface ResumenDepartamento {
  departamento_id: number;
  departamento_nombre: string;
  /** Total de unidades base consumidas */
  total_cantidad: number;
  /** Número de registros de salida */
  total_salidas: number;
}

/**
 * Resumen agregado por departamento: total de unidades consumidas y número de salidas.
 * Siempre devuelve todos los departamentos (LEFT JOIN), con 0 si no tienen salidas.
 * Los filtros de año/categoría se aplican como condiciones del JOIN para no excluir
 * departamentos sin salidas en ese período.
 */
export async function getResumenPorDepartamento(
  filtros: Pick<FiltrosSalida, "anio" | "anio_desde" | "anio_hasta" | "categoria_id"> = {}
): Promise<ResumenDepartamento[]> {
  const db = await getDbWithRetry()

  // Construir condiciones para el LEFT JOIN (no para WHERE, para mantener todos los depts)
  const joinSalida: string[] = []
  const joinProd: string[] = []
  const params: (string | number)[] = []

  if (filtros.anio)       { joinSalida.push("s.anio = ?");   params.push(filtros.anio) }
  if (filtros.anio_desde) { joinSalida.push("s.anio >= ?");  params.push(filtros.anio_desde) }
  if (filtros.anio_hasta) { joinSalida.push("s.anio <= ?");  params.push(filtros.anio_hasta) }
  if (filtros.categoria_id) { joinProd.push("p.categoria_id = ?"); params.push(filtros.categoria_id) }

  const salidaCond = joinSalida.length > 0 ? ` AND ${joinSalida.join(" AND ")}` : ""
  const usaProd = joinProd.length > 0
  const prodJoin = usaProd
    ? `LEFT JOIN productos_almacen p ON p.id = s.producto_id AND ${joinProd.join(" AND ")}`
    : ""

  return db.select<ResumenDepartamento[]>(
    `SELECT
       d.id     AS departamento_id,
       d.nombre AS departamento_nombre,
       COALESCE(SUM(s.cantidad), 0) AS total_cantidad,
       COUNT(s.id)                  AS total_salidas
     FROM departamentos_prod d
     LEFT JOIN salidas_productos s ON s.departamento_id = d.id${salidaCond}
     ${prodJoin}
     GROUP BY d.id, d.nombre
     ORDER BY total_cantidad DESC`,
    params
  )
}
