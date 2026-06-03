import { getDB } from "./db";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface CategoriaStock {
  id: number;
  nombre: string;
}

export interface ArticuloStock {
  id: number;
  nombre: string;
  categoria_id: number | null;
  categoria_nombre: string | null;
  unidad: string;
  stock_actual: number;
  stock_minimo: number | null;
  activo: number; // 1 | 0
}

export interface MovimientoStock {
  id: number;
  articulo_id: number;
  tipo: "entrada" | "salida";
  cantidad: number;
  notas: string | null;
  fecha: string; // "YYYY-MM-DD"
  // join helpers
  articulo_nombre?: string;
}

export interface NuevoArticulo {
  nombre: string;
  categoria_id?: number | null;
  unidad: string;
  stock_inicial?: number;
  stock_minimo?: number | null;
}

export interface NuevoMovimiento {
  articulo_id: number;
  tipo: "entrada" | "salida";
  cantidad: number;
  notas?: string;
  fecha: string;
}

export interface FiltrosMovimiento {
  articulo_id?: number;
  tipo?: "entrada" | "salida";
  fecha_desde?: string;
  fecha_hasta?: string;
}

// ─── Categorías ───────────────────────────────────────────────────────────────

export async function getCategorias(): Promise<CategoriaStock[]> {
  const db = await getDB();
  return db.select<CategoriaStock[]>(
    "SELECT * FROM categorias_stock ORDER BY nombre ASC"
  );
}

export async function crearCategoria(nombre: string): Promise<number> {
  const db = await getDB();
  const result = await db.execute(
    "INSERT INTO categorias_stock (nombre) VALUES (?)",
    [nombre.trim()]
  );
  if (result.lastInsertId === undefined) throw new Error("No se pudo crear la categoría");
  return result.lastInsertId;
}

export async function actualizarCategoria(id: number, nombre: string): Promise<void> {
  const db = await getDB();
  await db.execute("UPDATE categorias_stock SET nombre = ? WHERE id = ?", [nombre.trim(), id]);
}

export async function eliminarCategoria(id: number): Promise<void> {
  const db = await getDB();
  // Desasociar artículos antes de borrar
  await db.execute("UPDATE articulos_stock SET categoria_id = NULL WHERE categoria_id = ?", [id]);
  await db.execute("DELETE FROM categorias_stock WHERE id = ?", [id]);
}

// ─── Artículos ────────────────────────────────────────────────────────────────

export async function getArticulos(
  soloActivos = true,
  categoriaId?: number
): Promise<ArticuloStock[]> {
  const db = await getDB();

  const condiciones: string[] = [];
  const params: (string | number)[] = [];

  if (soloActivos) {
    condiciones.push("a.activo = 1");
  }
  if (categoriaId !== undefined) {
    condiciones.push("a.categoria_id = ?");
    params.push(categoriaId);
  }

  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(" AND ")}` : "";

  return db.select<ArticuloStock[]>(
    `SELECT
       a.id, a.nombre, a.categoria_id, c.nombre AS categoria_nombre,
       a.unidad, a.stock_actual, a.stock_minimo, a.activo
     FROM articulos_stock a
     LEFT JOIN categorias_stock c ON c.id = a.categoria_id
     ${where}
     ORDER BY a.nombre ASC`,
    params
  );
}

export async function crearArticulo(datos: NuevoArticulo): Promise<number> {
  const db = await getDB();
  const stockInicial = datos.stock_inicial ?? 0;

  const result = await db.execute(
    `INSERT INTO articulos_stock (nombre, categoria_id, unidad, stock_actual, stock_minimo)
     VALUES (?, ?, ?, ?, ?)`,
    [
      datos.nombre.trim(),
      datos.categoria_id ?? null,
      datos.unidad.trim(),
      stockInicial,
      datos.stock_minimo ?? null,
    ]
  );
  if (result.lastInsertId === undefined) throw new Error("No se pudo crear el artículo");

  const articuloId = result.lastInsertId;

  // Si hay stock inicial, registrar como movimiento de entrada
  if (stockInicial > 0) {
    await db.execute(
      `INSERT INTO movimientos_stock (articulo_id, tipo, cantidad, notas, fecha)
       VALUES (?, 'entrada', ?, 'Stock inicial', date('now'))`,
      [articuloId, stockInicial]
    );
  }

  return articuloId;
}

export async function actualizarArticulo(
  id: number,
  datos: Partial<NuevoArticulo>
): Promise<void> {
  const db = await getDB();

  const campos: string[] = [];
  const params: (string | number | null)[] = [];

  if (datos.nombre !== undefined) { campos.push("nombre = ?"); params.push(datos.nombre.trim()); }
  if ("categoria_id" in datos) { campos.push("categoria_id = ?"); params.push(datos.categoria_id ?? null); }
  if (datos.unidad !== undefined) { campos.push("unidad = ?"); params.push(datos.unidad.trim()); }
  if ("stock_minimo" in datos) { campos.push("stock_minimo = ?"); params.push(datos.stock_minimo ?? null); }

  if (campos.length === 0) return;
  params.push(id);
  await db.execute(`UPDATE articulos_stock SET ${campos.join(", ")} WHERE id = ?`, params);
}

export async function desactivarArticulo(id: number): Promise<void> {
  const db = await getDB();
  await db.execute("UPDATE articulos_stock SET activo = 0 WHERE id = ?", [id]);
}

export async function reactivarArticulo(id: number): Promise<void> {
  const db = await getDB();
  await db.execute("UPDATE articulos_stock SET activo = 1 WHERE id = ?", [id]);
}

// ─── Movimientos ──────────────────────────────────────────────────────────────

export async function getMovimientosPaginados(
  filtros: FiltrosMovimiento,
  pageSize: number,
  offset: number
): Promise<[MovimientoStock[], number]> {
  const db = await getDB();

  const condiciones: string[] = [];
  const params: (string | number)[] = [];

  if (filtros.articulo_id !== undefined) {
    condiciones.push("m.articulo_id = ?");
    params.push(filtros.articulo_id);
  }
  if (filtros.tipo) {
    condiciones.push("m.tipo = ?");
    params.push(filtros.tipo);
  }
  if (filtros.fecha_desde) {
    condiciones.push("m.fecha >= ?");
    params.push(filtros.fecha_desde);
  }
  if (filtros.fecha_hasta) {
    condiciones.push("m.fecha <= ?");
    params.push(filtros.fecha_hasta);
  }

  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(" AND ")}` : "";

  const query = `
    SELECT
      m.id, m.articulo_id, m.tipo, m.cantidad, m.notas, m.fecha,
      a.nombre AS articulo_nombre,
      COUNT(*) OVER() AS total_count
    FROM movimientos_stock m
    JOIN articulos_stock a ON a.id = m.articulo_id
    ${where}
    ORDER BY m.fecha DESC, m.id DESC
    LIMIT ? OFFSET ?
  `;

  params.push(pageSize, offset);
  const results = await db.select<Array<MovimientoStock & { total_count: number }>>(query, params);

  const total = results.length > 0 ? results[0].total_count : 0;
  const movimientos = results.map(({ total_count, ...rest }) => rest) as MovimientoStock[];

  return [movimientos, total];
}

export async function registrarMovimiento(datos: NuevoMovimiento): Promise<void> {
  const db = await getDB();

  // Verificar stock suficiente para salidas
  if (datos.tipo === "salida") {
    const rows = await db.select<{ stock_actual: number }[]>(
      "SELECT stock_actual FROM articulos_stock WHERE id = ?",
      [datos.articulo_id]
    );
    if (rows.length === 0) throw new Error("Artículo no encontrado");
    if (rows[0].stock_actual < datos.cantidad) {
      throw new Error(
        `Stock insuficiente. Disponible: ${rows[0].stock_actual}`
      );
    }
  }

  // Insertar movimiento
  await db.execute(
    `INSERT INTO movimientos_stock (articulo_id, tipo, cantidad, notas, fecha)
     VALUES (?, ?, ?, ?, ?)`,
    [datos.articulo_id, datos.tipo, datos.cantidad, datos.notas ?? null, datos.fecha]
  );

  // Actualizar stock_actual atómicamente
  const delta = datos.tipo === "entrada" ? datos.cantidad : -datos.cantidad;
  await db.execute(
    "UPDATE articulos_stock SET stock_actual = stock_actual + ? WHERE id = ?",
    [delta, datos.articulo_id]
  );
}

export async function eliminarMovimiento(id: number): Promise<void> {
  const db = await getDB();

  // Recuperar el movimiento antes de borrarlo para revertir el stock
  const rows = await db.select<MovimientoStock[]>(
    "SELECT * FROM movimientos_stock WHERE id = ?",
    [id]
  );
  if (rows.length === 0) return;

  const mov = rows[0];

  // Revertir: si era entrada, restamos; si era salida, sumamos
  const delta = mov.tipo === "entrada" ? -mov.cantidad : mov.cantidad;

  // Verificar que revertir no deje stock negativo
  if (mov.tipo === "entrada") {
    const articulo = await db.select<{ stock_actual: number }[]>(
      "SELECT stock_actual FROM articulos_stock WHERE id = ?",
      [mov.articulo_id]
    );
    if (articulo[0].stock_actual < mov.cantidad) {
      throw new Error(
        "No se puede eliminar: el stock actual es menor que la cantidad de esta entrada (ya se han registrado salidas posteriores)."
      );
    }
  }

  await db.execute("DELETE FROM movimientos_stock WHERE id = ?", [id]);
  await db.execute(
    "UPDATE articulos_stock SET stock_actual = stock_actual + ? WHERE id = ?",
    [delta, mov.articulo_id]
  );
}

// ─── Estadísticas / resumen ───────────────────────────────────────────────────

export interface ResumenStock {
  total_articulos: number;
  articulos_bajo_minimo: number;
  articulos_sin_stock: number;
  total_entradas_mes: number;
  total_salidas_mes: number;
}

export async function getResumen(): Promise<ResumenStock> {
  const db = await getDB();

  const [general] = await db.select<ResumenStock[]>(`
    SELECT
      COUNT(*)                                                              AS total_articulos,
      COUNT(CASE WHEN stock_minimo IS NOT NULL
                  AND stock_actual <= stock_minimo THEN 1 END)             AS articulos_bajo_minimo,
      COUNT(CASE WHEN stock_actual = 0 THEN 1 END)                        AS articulos_sin_stock,
      0 AS total_entradas_mes,
      0 AS total_salidas_mes
    FROM articulos_stock
    WHERE activo = 1
  `);

  const mesActual = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  const [movMes] = await db.select<{ entradas: number; salidas: number }[]>(`
    SELECT
      SUM(CASE WHEN tipo = 'entrada' THEN cantidad ELSE 0 END) AS entradas,
      SUM(CASE WHEN tipo = 'salida'  THEN cantidad ELSE 0 END) AS salidas
    FROM movimientos_stock
    WHERE strftime('%Y-%m', fecha) = ?
  `, [mesActual]);

  return {
    ...general,
    total_entradas_mes: movMes?.entradas ?? 0,
    total_salidas_mes:  movMes?.salidas  ?? 0,
  };
}

export interface MovimientoReciente extends MovimientoStock {
  articulo_nombre: string;
}

export async function getMovimientosRecientes(limit = 8): Promise<MovimientoReciente[]> {
  const db = await getDB();
  return db.select<MovimientoReciente[]>(
    `SELECT m.*, a.nombre AS articulo_nombre
     FROM movimientos_stock m
     JOIN articulos_stock a ON a.id = m.articulo_id
     ORDER BY m.fecha DESC, m.id DESC
     LIMIT ?`,
    [limit]
  );
}
