import Database from "@tauri-apps/plugin-sql";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface CategoriaProducto {
  id: number;
  nombre: string;
}

export interface ProductoAlmacen {
  id: number;
  referencia: string;
  nombre: string;
  categoria_id: number;
  categoria_nombre?: string; // viene del JOIN
  unidad_medida: string;
  activo: number; // 1 | 0
  precio?: number | null;
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

/**
 * Retry logic para manejar "database is locked"
 * Reintenta la operación hasta 3 veces con espera progresiva
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      const errorMsg = error?.message || String(error);
      const isLockError =
        errorMsg.includes("database is locked") ||
        errorMsg.includes("SQLITE_BUSY") ||
        errorMsg.includes("SQLITE_LOCKED") ||
        error?.code === 5;

      if (!isLockError || i === maxRetries - 1) {
        throw error;
      }

      const delay = 200 * Math.pow(2, i);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

async function getDb(): Promise<Database> {
  const db = await Database.load("sqlite:inventario.db");
  try {
    await db.execute("PRAGMA busy_timeout = 10000");
    await db.execute("PRAGMA journal_mode = WAL");
  } catch (e) {
    // Ignorar errores al configurar pragmas
  }
  return db;
}

export async function getDbWithRetry(): Promise<Database> {
  return withRetry(getDb);
}

export interface DepartamentoProd {
  id: number;
  nombre: string;
}

export interface SalidaProducto {
  id: number;
  producto_id: number;
  departamento_id: number;
  cantidad: number;
  mes: number;   // 1–12
  anio: number;
  presentacion_id?: number | null;
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
  cantidad: number;
  mes: number;
  anio: number;
  presentacion_id?: number | null;
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
  const db = await getDbWithRetry();
  return db.select<CategoriaProducto[]>(
    "SELECT * FROM categorias_producto ORDER BY nombre ASC"
  );
}

export async function crearCategoria(nombre: string): Promise<number> {
  const db = await getDbWithRetry();
  const result = await db.execute(
    "INSERT INTO categorias_producto (nombre) VALUES (?)",
    [nombre.trim()]
  );
  if (result.lastInsertId === undefined) {
    throw new Error("No se pudo crear la categoría");
  }
  return result.lastInsertId;
}

export async function actualizarCategoria(
  id: number,
  nombre: string
): Promise<void> {
  const db = await getDbWithRetry();
  await db.execute(
    "UPDATE categorias_producto SET nombre = ? WHERE id = ?",
    [nombre.trim(), id]
  );
}

export async function eliminarCategoria(id: number): Promise<void> {
  const db = await getDbWithRetry();
  const rows = await db.select<{ total: number }[]>(
    "SELECT COUNT(*) AS total FROM productos_almacen WHERE categoria_id = ? AND activo = 1",
    [id]
  );
  if (rows[0].total > 0) {
    throw new Error("No se puede eliminar una categoría con productos activos.");
  }
  await db.execute("DELETE FROM categorias_producto WHERE id = ?", [id]);
}

// ─── Productos ────────────────────────────────────────────────────────────────

export async function getProductos(soloActivos = true): Promise<ProductoAlmacen[]> {
  const db = await getDbWithRetry();
  const where = soloActivos ? "WHERE p.activo = 1" : "";
  return db.select<ProductoAlmacen[]>(
    `SELECT
       p.id, p.referencia, p.nombre, p.categoria_id,
       c.nombre AS categoria_nombre,
       p.unidad_medida, p.activo, p.precio
     FROM productos_almacen p
     JOIN categorias_producto c ON c.id = p.categoria_id
     ${where}
     ORDER BY c.nombre ASC, p.referencia ASC`
  );
}

export async function getProductosPorCategoria(
  categoria_id: number,
  soloActivos = true
): Promise<ProductoAlmacen[]> {
  const db = await getDbWithRetry();
  const condActivo = soloActivos ? "AND p.activo = 1" : "";
  return db.select<ProductoAlmacen[]>(
    `SELECT
       p.id, p.referencia, p.nombre, p.categoria_id,
       c.nombre AS categoria_nombre,
       p.unidad_medida, p.activo, p.precio
     FROM productos_almacen p
     JOIN categorias_producto c ON c.id = p.categoria_id
     WHERE p.categoria_id = ? ${condActivo}
     ORDER BY p.referencia ASC`,
    [categoria_id]
  );
}

export async function crearProducto(
  referencia: string,
  nombre: string,
  categoria_id: number,
  unidad_medida: string,
  precio?: number | null
): Promise<number> {
  const db = await getDbWithRetry();
  const result = await db.execute(
    "INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, precio) VALUES (?, ?, ?, ?, ?)",
    [referencia.trim(), nombre.trim(), categoria_id, unidad_medida.trim(), precio]
  );
  if (result.lastInsertId === undefined) {
    throw new Error("No se pudo crear el producto");
  }
  return result.lastInsertId;
}

export async function actualizarProducto(
  id: number,
  datos: Partial<Pick<ProductoAlmacen, "referencia" | "nombre" | "categoria_id" | "unidad_medida" | "precio">>
): Promise<void> {
  const db = await getDbWithRetry();

  const campos: string[] = [];
  const params: (string | number | null)[] = [];

  if (datos.referencia !== undefined)   { campos.push("referencia = ?");   params.push(datos.referencia.trim()); }
  if (datos.nombre !== undefined)        { campos.push("nombre = ?");        params.push(datos.nombre.trim()); }
  if (datos.categoria_id !== undefined)  { campos.push("categoria_id = ?");  params.push(datos.categoria_id); }
  if (datos.unidad_medida !== undefined) { campos.push("unidad_medida = ?"); params.push(datos.unidad_medida.trim()); }
  if (datos.precio !== undefined)        { campos.push("precio = ?");        params.push(datos.precio); }

  if (campos.length === 0) return;

  params.push(id);
  await db.execute(
    `UPDATE productos_almacen SET ${campos.join(", ")} WHERE id = ?`,
    params
  );
}

export async function desactivarProducto(id: number): Promise<void> {
  const db = await getDbWithRetry();
  await db.execute("UPDATE productos_almacen SET activo = 0 WHERE id = ?", [id]);
}

export async function reactivarProducto(id: number): Promise<void> {
  const db = await getDbWithRetry();
  await db.execute("UPDATE productos_almacen SET activo = 1 WHERE id = ?", [id]);
}

// ─── Departamentos ────────────────────────────────────────────────────────────

export async function getDepartamentosProd(): Promise<DepartamentoProd[]> {
  const db = await getDbWithRetry();
  return db.select<DepartamentoProd[]>(
    "SELECT * FROM departamentos_prod ORDER BY nombre ASC"
  );
}

export async function crearDepartamentoProd(nombre: string): Promise<number> {
  const db = await getDbWithRetry();
  const result = await db.execute(
    "INSERT INTO departamentos_prod (nombre) VALUES (?)",
    [nombre.trim()]
  );
  if (result.lastInsertId === undefined) {
    throw new Error("No se pudo crear el departamento");
  }
  return result.lastInsertId;
}

export async function actualizarDepartamentoProd(
  id: number,
  nombre: string
): Promise<void> {
  const db = await getDbWithRetry();
  await db.execute(
    "UPDATE departamentos_prod SET nombre = ? WHERE id = ?",
    [nombre.trim(), id]
  );
}

export async function eliminarDepartamentoProd(id: number): Promise<void> {
  const db = await getDbWithRetry();
  const rows = await db.select<{ total: number }[]>(
    "SELECT COUNT(*) AS total FROM salidas_productos WHERE departamento_id = ?",
    [id]
  );
  if (rows[0].total > 0) {
    throw new Error("No se puede eliminar un departamento con salidas registradas.");
  }
  await db.execute("DELETE FROM departamentos_prod WHERE id = ?", [id]);
}

// ─── Salidas ──────────────────────────────────────────────────────────────────

export async function getSalidas(
  filtros: FiltrosSalida = {}
): Promise<SalidaProducto[]> {
  const db = await getDbWithRetry();

  const condiciones: string[] = [];
  const params: (string | number)[] = [];

  if (filtros.departamento_id) { condiciones.push("s.departamento_id = ?"); params.push(filtros.departamento_id); }
  if (filtros.producto_id)     { condiciones.push("s.producto_id = ?");     params.push(filtros.producto_id); }
  if (filtros.categoria_id)    { condiciones.push("p.categoria_id = ?");    params.push(filtros.categoria_id); }
  if (filtros.mes)             { condiciones.push("s.mes = ?");             params.push(filtros.mes); }
  if (filtros.anio)            { condiciones.push("s.anio = ?");            params.push(filtros.anio); }
  if (filtros.anio_desde)      { condiciones.push("s.anio >= ?");           params.push(filtros.anio_desde); }
  if (filtros.anio_hasta)      { condiciones.push("s.anio <= ?");           params.push(filtros.anio_hasta); }

  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(" AND ")}` : "";

  return db.select<SalidaProducto[]>(
    `SELECT
       s.id, s.producto_id, s.departamento_id, s.cantidad, s.mes, s.anio,
       s.presentacion_id,
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
  );
}

/**
 * Inserta o actualiza una salida (upsert).
 *
 * La unicidad depende de si se proporciona presentacion_id:
 *   - CON presentacion_id: unicidad por (producto_id, departamento_id, presentacion_id, mes, anio)
 *   - SIN presentacion_id: unicidad por (producto_id, departamento_id, mes, anio)
 *
 * Si cantidad = 0, elimina el registro.
 */
export async function upsertSalida(datos: NuevaSalida): Promise<void> {
  const db = await getDbWithRetry();

  if (datos.cantidad === 0) {
    if (datos.presentacion_id != null) {
      await db.execute(
        `DELETE FROM salidas_productos
         WHERE producto_id = ? AND departamento_id = ? AND presentacion_id = ? AND mes = ? AND anio = ?`,
        [datos.producto_id, datos.departamento_id, datos.presentacion_id, datos.mes, datos.anio]
      );
    } else {
      await db.execute(
        `DELETE FROM salidas_productos
         WHERE producto_id = ? AND departamento_id = ? AND presentacion_id IS NULL AND mes = ? AND anio = ?`,
        [datos.producto_id, datos.departamento_id, datos.mes, datos.anio]
      );
    }
    return;
  }

  if (datos.presentacion_id != null) {
    await db.execute(
      `INSERT INTO salidas_productos (producto_id, departamento_id, presentacion_id, cantidad, mes, anio)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(producto_id, departamento_id, presentacion_id, mes, anio)
       DO UPDATE SET cantidad = excluded.cantidad`,
      [datos.producto_id, datos.departamento_id, datos.presentacion_id, datos.cantidad, datos.mes, datos.anio]
    );
  } else {
    await db.execute(
      `INSERT INTO salidas_productos (producto_id, departamento_id, cantidad, mes, anio)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(producto_id, departamento_id, mes, anio)
       DO UPDATE SET cantidad = excluded.cantidad`,
      [datos.producto_id, datos.departamento_id, datos.cantidad, datos.mes, datos.anio]
    );
  }
}

export async function eliminarSalida(id: number): Promise<void> {
  const db = await getDbWithRetry();
  await db.execute("DELETE FROM salidas_productos WHERE id = ?", [id]);
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
  const db = await getDbWithRetry();

  const condiciones: string[] = [];
  const params: (string | number)[] = [];

  if (filtros.departamento_id) { condiciones.push("s.departamento_id = ?"); params.push(filtros.departamento_id); }
  if (filtros.categoria_id)    { condiciones.push("p.categoria_id = ?");    params.push(filtros.categoria_id); }
  if (filtros.anio_desde)      { condiciones.push("s.anio >= ?");           params.push(filtros.anio_desde); }
  if (filtros.anio_hasta)      { condiciones.push("s.anio <= ?");           params.push(filtros.anio_hasta); }

  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(" AND ")}` : "";

  return db.select<ConsumoMensualDepartamento[]>(
    `SELECT
       s.anio, s.mes,
       s.departamento_id,
       d.nombre AS departamento_nombre,
       SUM(s.cantidad) AS total_cantidad
     FROM salidas_productos s
     JOIN departamentos_prod d ON d.id = s.departamento_id
     JOIN productos_almacen p ON p.id = s.producto_id
     ${where}
     GROUP BY s.anio, s.mes, s.departamento_id
     ORDER BY s.anio ASC, s.mes ASC`,
    params
  );
}

export interface MatrizConsumo {
  producto_id: number;
  producto_referencia: string;
  producto_nombre: string;
  unidad_medida: string;
  categoria_nombre: string;
  [key: string]: number | string;
}

export async function getMatrizConsumo(
  anio: number,
  mes: number,
  categoria_id?: number
): Promise<{ matriz: MatrizConsumo[]; departamentos: DepartamentoProd[] }> {
  const db = await getDbWithRetry();

  const departamentos = await getDepartamentosProd();

  const condCat = categoria_id ? "AND p.categoria_id = ?" : "";
  const params: (string | number)[] = [anio, mes];
  if (categoria_id) params.push(categoria_id);

  const salidas = await db.select<{
    producto_id: number;
    referencia: string;
    nombre: string;
    unidad_medida: string;
    categoria_nombre: string;
    departamento_id: number;
    cantidad: number;
  }[]>(
    `SELECT
       p.id AS producto_id,
       p.referencia,
       p.nombre,
       p.unidad_medida,
       c.nombre AS categoria_nombre,
       s.departamento_id,
       s.cantidad
     FROM salidas_productos s
     JOIN productos_almacen p ON p.id = s.producto_id
     JOIN categorias_producto c ON c.id = p.categoria_id
     WHERE s.anio = ? AND s.mes = ? ${condCat} AND p.activo = 1
     ORDER BY c.nombre ASC, p.referencia ASC`,
    params
  );

  const mapa = new Map<number, MatrizConsumo>();

  for (const fila of salidas) {
    if (!mapa.has(fila.producto_id)) {
      mapa.set(fila.producto_id, {
        producto_id: fila.producto_id,
        producto_referencia: fila.referencia,
        producto_nombre: fila.nombre,
        unidad_medida: fila.unidad_medida,
        categoria_nombre: fila.categoria_nombre,
      });
    }
    mapa.get(fila.producto_id)![`dep_${fila.departamento_id}`] = fila.cantidad;
  }

  return { matriz: Array.from(mapa.values()), departamentos };
}

export interface ResumenDepartamento {
  departamento_id: number;
  departamento_nombre: string;
  total_salidas: number;
  total_cantidad: number;
  productos_distintos: number;
}

export async function getResumenPorDepartamento(
  filtros: FiltrosSalida = {}
): Promise<ResumenDepartamento[]> {
  const db = await getDbWithRetry();

  const condiciones: string[] = [];
  const params: (string | number)[] = [];

  if (filtros.anio)        { condiciones.push("s.anio = ?");          params.push(filtros.anio); }
  if (filtros.anio_desde)  { condiciones.push("s.anio >= ?");         params.push(filtros.anio_desde); }
  if (filtros.anio_hasta)  { condiciones.push("s.anio <= ?");         params.push(filtros.anio_hasta); }
  if (filtros.categoria_id){ condiciones.push("p.categoria_id = ?");  params.push(filtros.categoria_id); }

  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(" AND ")}` : "";

  return db.select<ResumenDepartamento[]>(
    `SELECT
       d.id AS departamento_id,
       d.nombre AS departamento_nombre,
       COUNT(s.id) AS total_salidas,
       SUM(s.cantidad) AS total_cantidad,
       COUNT(DISTINCT s.producto_id) AS productos_distintos
     FROM departamentos_prod d
     LEFT JOIN salidas_productos s ON s.departamento_id = d.id
     LEFT JOIN productos_almacen p ON p.id = s.producto_id
     ${where}
     GROUP BY d.id
     ORDER BY total_cantidad DESC NULLS LAST`,
    params
  );
}

// ─── Funciones adicionales ────────────────────────────────────────────────────

export async function deleteProduct(productId: number): Promise<void> {
  const db = await getDbWithRetry();
  await db.execute("DELETE FROM salidas_productos WHERE producto_id = ?", [productId]);
  await db.execute("DELETE FROM producto_presentaciones WHERE producto_id = ?", [productId]);
  await db.execute("DELETE FROM productos_almacen WHERE id = ?", [productId]);
}

/**
 * Obtiene todas las salidas de un año/departamento, desglosadas por presentación.
 *
 * Devuelve un mapa con clave compuesta "productoId_presentacionId"
 * (o "productoId_null" si no tiene presentación) → mes → cantidad.
 *
 * Ejemplo de clave: "12_3" = producto 12, presentación 3
 *                   "12_null" = producto 12 sin presentación
 */
export async function getSalidasByYear(
  year: number,
  departamentoId?: number
): Promise<Map<string, Map<number, number>>> {
  const db = await getDbWithRetry();

  const condiciones: string[] = ["s.anio = ?"];
  const params: (number | null)[] = [year];

  if (departamentoId !== undefined) {
    condiciones.push("s.departamento_id = ?");
    params.push(departamentoId);
  }

  const where = `WHERE ${condiciones.join(" AND ")}`;

  const rows = await db.select<{
    producto_id: number;
    presentacion_id: number | null;
    mes: number;
    cantidad: number;
  }[]>(
    `SELECT
       s.producto_id,
       s.presentacion_id,
       s.mes,
       s.cantidad
     FROM salidas_productos s
     ${where}
     ORDER BY s.producto_id, s.presentacion_id, s.mes`,
    params
  );

  const resultado = new Map<string, Map<number, number>>();

  for (const row of rows) {
    const clave = `${row.producto_id}_${row.presentacion_id ?? "null"}`;
    if (!resultado.has(clave)) {
      resultado.set(clave, new Map());
    }
    resultado.get(clave)!.set(row.mes, row.cantidad);
  }

  return resultado;
}

/** Construye la clave del mapa de salidas para un producto + presentación */
export function claveSalida(productoId: number, presentacionId: number | null | undefined): string {
  return `${productoId}_${presentacionId ?? "null"}`;
}

export async function getAniosDisponibles(): Promise<number[]> {
  const db = await getDbWithRetry();
  const rows = await db.select<{ anio: number }[]>(
    `SELECT DISTINCT anio FROM salidas_productos ORDER BY anio DESC LIMIT 5`
  );
  return rows.map(r => r.anio);
}

export async function ensureProduct(
  referencia: string,
  nombre: string,
  categoriaId: number,
  unidadMedida: string,
  precio?: number | null
): Promise<number> {
  const db = await getDbWithRetry();

  const existente = await db.select<{ id: number; precio?: number | null }[]>(
    "SELECT id, precio FROM productos_almacen WHERE referencia = ?",
    [referencia.trim()]
  );

  if (existente.length > 0) {
    const producto = existente[0];
    await actualizarProducto(producto.id, {
      nombre: nombre.trim(),
      categoria_id: categoriaId,
      unidad_medida: unidadMedida.trim(),
      ...(precio !== undefined && precio !== null && { precio }),
    });
    return producto.id;
  } else {
    return await crearProducto(referencia.trim(), nombre.trim(), categoriaId, unidadMedida.trim(), precio);
  }
}

// ─── Unidades de presentación ─────────────────────────────────────────────────

export interface UnidadPresentacion {
  id: number;
  nombre: string;
}

export interface ProductoPresentacion {
  id: number;         // id en producto_presentaciones
  producto_id: number;
  unidad_id: number;
  nombre: string;     // nombre de la unidad (join)
  precio: number | null;
}

export async function getUnidadesPresentacion(): Promise<UnidadPresentacion[]> {
  const db = await getDbWithRetry();
  return db.select<UnidadPresentacion[]>(
    "SELECT * FROM unidades_presentacion ORDER BY nombre"
  );
}

export async function crearUnidadPresentacion(nombre: string): Promise<number> {
  const db = await getDbWithRetry();
  const result = await db.execute(
    "INSERT INTO unidades_presentacion (nombre) VALUES (?)",
    [nombre.trim()]
  );
  if (result.lastInsertId === undefined) {
    throw new Error("No se pudo crear la unidad de presentación");
  }
  return result.lastInsertId;
}

/**
 * Obtiene las presentaciones configuradas para un producto específico,
 * incluyendo el nombre de la unidad y su precio.
 */
export async function getPresentacionesDeProducto(productoId: number): Promise<ProductoPresentacion[]> {
  const db = await getDbWithRetry();
  return db.select<ProductoPresentacion[]>(
    `SELECT
       pp.id,
       pp.producto_id,
       pp.unidad_id,
       up.nombre,
       pp.precio
     FROM producto_presentaciones pp
     JOIN unidades_presentacion up ON up.id = pp.unidad_id
     WHERE pp.producto_id = ?
     ORDER BY up.nombre`,
    [productoId]
  );
}

/**
 * Obtiene las presentaciones de TODOS los productos en una sola query.
 * Más eficiente que llamar getPresentacionesDeProducto por cada producto.
 * Devuelve un mapa: producto_id → ProductoPresentacion[]
 */
export async function getAllPresentaciones(): Promise<Map<number, ProductoPresentacion[]>> {
  const db = await getDbWithRetry();
  const rows = await db.select<ProductoPresentacion[]>(
    `SELECT
       pp.id,
       pp.producto_id,
       pp.unidad_id,
       up.nombre,
       pp.precio
     FROM producto_presentaciones pp
     JOIN unidades_presentacion up ON up.id = pp.unidad_id
     ORDER BY pp.producto_id, up.nombre`
  );

  const mapa = new Map<number, ProductoPresentacion[]>();
  for (const row of rows) {
    if (!mapa.has(row.producto_id)) {
      mapa.set(row.producto_id, []);
    }
    mapa.get(row.producto_id)!.push(row);
  }
  return mapa;
}

/**
 * Inserta o actualiza una presentación de producto (precio por unidad).
 * Si ya existe (producto_id + unidad_id), actualiza el precio.
 */
export async function upsertPresentacion(
  productoId: number,
  unidadId: number,
  precio: number | null
): Promise<number> {
  const db = await getDbWithRetry();
  const result = await db.execute(
    `INSERT INTO producto_presentaciones (producto_id, unidad_id, precio)
     VALUES (?, ?, ?)
     ON CONFLICT(producto_id, unidad_id)
     DO UPDATE SET precio = excluded.precio`,
    [productoId, unidadId, precio]
  );

  if (result.lastInsertId === undefined) {
    const rows = await db.select<{ id: number }[]>(
      "SELECT id FROM producto_presentaciones WHERE producto_id = ? AND unidad_id = ?",
      [productoId, unidadId]
    );
    if (rows.length > 0) return rows[0].id;
    throw new Error("No se pudo insertar o actualizar la presentación");
  }
  return result.lastInsertId;
}

/**
 * Elimina una presentación de producto.
 * Lanza error si tiene salidas asociadas.
 */
export async function deletePresentacion(presentacionId: number): Promise<void> {
  const db = await getDbWithRetry();

  const rows = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) AS count FROM salidas_productos WHERE presentacion_id = ?",
    [presentacionId]
  );

  if (rows[0].count > 0) {
    throw new Error("No se puede eliminar una presentación que tiene salidas registradas");
  }

  await db.execute("DELETE FROM producto_presentaciones WHERE id = ?", [presentacionId]);
}
