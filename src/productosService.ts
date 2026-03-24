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

// ─── Conexión ─────────────────────────────────────────────────────────────────

async function getDb(): Promise<Database> {
  return Database.load("sqlite:inventario.db");
}

// ─── Categorías ───────────────────────────────────────────────────────────────

export async function getCategorias(): Promise<CategoriaProducto[]> {
  const db = await getDb();
  return db.select<CategoriaProducto[]>(
    "SELECT * FROM categorias_producto ORDER BY nombre ASC"
  );
}

export async function crearCategoria(nombre: string): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    "INSERT INTO categorias_producto (nombre) VALUES (?)",
    [nombre.trim()]
  );
  return result.lastInsertId;
}

export async function actualizarCategoria(
  id: number,
  nombre: string
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE categorias_producto SET nombre = ? WHERE id = ?",
    [nombre.trim(), id]
  );
}

export async function eliminarCategoria(id: number): Promise<void> {
  // Solo se puede eliminar si no tiene productos asociados
  const db = await getDb();
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
  const db = await getDb();
  const where = soloActivos ? "WHERE p.activo = 1" : "";
  return db.select<ProductoAlmacen[]>(
    `SELECT
       p.id, p.referencia, p.nombre, p.categoria_id,
       c.nombre AS categoria_nombre,
       p.unidad_medida, p.activo
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
  const db = await getDb();
  const condActivo = soloActivos ? "AND p.activo = 1" : "";
  return db.select<ProductoAlmacen[]>(
    `SELECT
       p.id, p.referencia, p.nombre, p.categoria_id,
       c.nombre AS categoria_nombre,
       p.unidad_medida, p.activo
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
  unidad_medida: string
): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    "INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida) VALUES (?, ?, ?, ?)",
    [referencia.trim(), nombre.trim(), categoria_id, unidad_medida.trim()]
  );
  return result.lastInsertId;
}

export async function actualizarProducto(
  id: number,
  datos: Partial<Pick<ProductoAlmacen, "referencia" | "nombre" | "categoria_id" | "unidad_medida">>
): Promise<void> {
  const db = await getDb();

  const campos: string[] = [];
  const params: (string | number)[] = [];

  if (datos.referencia !== undefined) { campos.push("referencia = ?"); params.push(datos.referencia.trim()); }
  if (datos.nombre !== undefined)     { campos.push("nombre = ?");     params.push(datos.nombre.trim()); }
  if (datos.categoria_id !== undefined) { campos.push("categoria_id = ?"); params.push(datos.categoria_id); }
  if (datos.unidad_medida !== undefined) { campos.push("unidad_medida = ?"); params.push(datos.unidad_medida.trim()); }

  if (campos.length === 0) return;

  params.push(id);
  await db.execute(
    `UPDATE productos_almacen SET ${campos.join(", ")} WHERE id = ?`,
    params
  );
}

export async function desactivarProducto(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE productos_almacen SET activo = 0 WHERE id = ?", [id]);
}

export async function reactivarProducto(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE productos_almacen SET activo = 1 WHERE id = ?", [id]);
}

// ─── Departamentos ────────────────────────────────────────────────────────────

export async function getDepartamentosProd(): Promise<DepartamentoProd[]> {
  const db = await getDb();
  return db.select<DepartamentoProd[]>(
    "SELECT * FROM departamentos_prod ORDER BY nombre ASC"
  );
}

export async function crearDepartamentoProd(nombre: string): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    "INSERT INTO departamentos_prod (nombre) VALUES (?)",
    [nombre.trim()]
  );
  return result.lastInsertId;
}

export async function actualizarDepartamentoProd(
  id: number,
  nombre: string
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE departamentos_prod SET nombre = ? WHERE id = ?",
    [nombre.trim(), id]
  );
}

export async function eliminarDepartamentoProd(id: number): Promise<void> {
  const db = await getDb();
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
  const db = await getDb();

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
 * Si ya existe (producto+departamento+mes+año), actualiza la cantidad.
 * Si cantidad = 0, elimina el registro para no acumular basura.
 */
export async function upsertSalida(datos: NuevaSalida): Promise<void> {
  const db = await getDb();

  if (datos.cantidad === 0) {
    await db.execute(
      `DELETE FROM salidas_productos
       WHERE producto_id = ? AND departamento_id = ? AND mes = ? AND anio = ?`,
      [datos.producto_id, datos.departamento_id, datos.mes, datos.anio]
    );
    return;
  }

  await db.execute(
    `INSERT INTO salidas_productos (producto_id, departamento_id, cantidad, mes, anio)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(producto_id, departamento_id, mes, anio)
     DO UPDATE SET cantidad = excluded.cantidad`,
    [datos.producto_id, datos.departamento_id, datos.cantidad, datos.mes, datos.anio]
  );
}

export async function eliminarSalida(id: number): Promise<void> {
  const db = await getDb();
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

/** Consumo mensual total por departamento — para gráfico Recharts */
export async function getConsumoMensualPorDepartamento(
  filtros: FiltrosSalida = {}
): Promise<ConsumoMensualDepartamento[]> {
  const db = await getDb();

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
  // clave dinámica: "dep_{departamento_id}" → cantidad
  [key: string]: number | string;
}

/**
 * Devuelve una matriz producto × departamento para un mes/año concreto.
 * Útil para la vista de tabla editable estilo Excel.
 * Las columnas de departamento se añaden como dep_{id}.
 */
export async function getMatrizConsumo(
  anio: number,
  mes: number,
  categoria_id?: number
): Promise<{ matriz: MatrizConsumo[]; departamentos: DepartamentoProd[] }> {
  const db = await getDb();

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

  // Agrupar en mapa producto → fila
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
  total_salidas: number;       // número de registros
  total_cantidad: number;      // suma de unidades
  productos_distintos: number;
}

/** Resumen por departamento en un periodo — para tabla de estadísticas */
export async function getResumenPorDepartamento(
  filtros: FiltrosSalida = {}
): Promise<ResumenDepartamento[]> {
  const db = await getDb();

  const condiciones: string[] = [];
  const params: (string | number)[] = [];

  if (filtros.anio)       { condiciones.push("s.anio = ?");    params.push(filtros.anio); }
  if (filtros.anio_desde) { condiciones.push("s.anio >= ?");   params.push(filtros.anio_desde); }
  if (filtros.anio_hasta) { condiciones.push("s.anio <= ?");   params.push(filtros.anio_hasta); }
  if (filtros.categoria_id) { condiciones.push("p.categoria_id = ?"); params.push(filtros.categoria_id); }

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
