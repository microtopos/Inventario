import Database from "@tauri-apps/plugin-sql";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface Vehiculo {
  id: number;
  matricula: string;
  nombre: string;
  activo: number; // 1 | 0
}

export interface Repostaje {
  id: number;
  vehiculo_id: number;
  fecha: string; // ISO date "YYYY-MM-DD"
  coste: number;
  notas: string | null;
  // join helpers (opcionales, vienen de queries con JOIN)
  vehiculo_nombre?: string;
  vehiculo_matricula?: string;
}

export interface NuevoRepostaje {
  vehiculo_id: number;
  fecha: string;
  coste: number;
  notas?: string;
}

export interface FiltrosRepostaje {
  vehiculo_id?: number;
  fecha_desde?: string; // "YYYY-MM-DD"
  fecha_hasta?: string; // "YYYY-MM-DD"
}

// ─── Conexión ─────────────────────────────────────────────────────────────────

async function getDb(): Promise<Database> {
  return Database.load("sqlite:inventario.db");
}

// ─── Vehículos ────────────────────────────────────────────────────────────────

export async function getVehiculos(soloActivos = true): Promise<Vehiculo[]> {
  const db = await getDb();
  const query = soloActivos
    ? "SELECT * FROM vehiculos WHERE activo = 1 ORDER BY nombre ASC"
    : "SELECT * FROM vehiculos ORDER BY nombre ASC";
  return db.select<Vehiculo[]>(query);
}

export async function crearVehiculo(
  matricula: string,
  nombre: string
): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    "INSERT INTO vehiculos (matricula, nombre) VALUES (?, ?)",
    [matricula.trim().toUpperCase(), nombre.trim()]
  );
  return result.lastInsertId;
}

export async function actualizarVehiculo(
  id: number,
  matricula: string,
  nombre: string
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE vehiculos SET matricula = ?, nombre = ? WHERE id = ?",
    [matricula.trim().toUpperCase(), nombre.trim(), id]
  );
}

export async function desactivarVehiculo(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE vehiculos SET activo = 0 WHERE id = ?", [id]);
}

export async function reactivarVehiculo(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE vehiculos SET activo = 1 WHERE id = ?", [id]);
}

// ─── Repostajes ───────────────────────────────────────────────────────────────

export async function getRepostajes(
  filtros: FiltrosRepostaje = {}
): Promise<Repostaje[]> {
  const db = await getDb();

  const condiciones: string[] = [];
  const params: (string | number)[] = [];

  if (filtros.vehiculo_id) {
    condiciones.push("r.vehiculo_id = ?");
    params.push(filtros.vehiculo_id);
  }
  if (filtros.fecha_desde) {
    condiciones.push("r.fecha >= ?");
    params.push(filtros.fecha_desde);
  }
  if (filtros.fecha_hasta) {
    condiciones.push("r.fecha <= ?");
    params.push(filtros.fecha_hasta);
  }

  const where =
    condiciones.length > 0 ? `WHERE ${condiciones.join(" AND ")}` : "";

  return db.select<Repostaje[]>(
    `SELECT
       r.id, r.vehiculo_id, r.fecha, r.coste, r.notas,
       v.nombre AS vehiculo_nombre,
       v.matricula AS vehiculo_matricula
     FROM repostajes r
     JOIN vehiculos v ON v.id = r.vehiculo_id
     ${where}
     ORDER BY r.fecha DESC`,
    params
  );
}

export async function crearRepostaje(datos: NuevoRepostaje): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    "INSERT INTO repostajes (vehiculo_id, fecha, coste, notas) VALUES (?, ?, ?, ?)",
    [datos.vehiculo_id, datos.fecha, datos.coste, datos.notas ?? null]
  );
  return result.lastInsertId;
}

export async function actualizarRepostaje(
  id: number,
  datos: Partial<NuevoRepostaje>
): Promise<void> {
  const db = await getDb();

  const campos: string[] = [];
  const params: (string | number | null)[] = [];

  if (datos.vehiculo_id !== undefined) {
    campos.push("vehiculo_id = ?");
    params.push(datos.vehiculo_id);
  }
  if (datos.fecha !== undefined) {
    campos.push("fecha = ?");
    params.push(datos.fecha);
  }
  if (datos.coste !== undefined) {
    campos.push("coste = ?");
    params.push(datos.coste);
  }
  if ("notas" in datos) {
    campos.push("notas = ?");
    params.push(datos.notas ?? null);
  }

  if (campos.length === 0) return;

  params.push(id);
  await db.execute(
    `UPDATE repostajes SET ${campos.join(", ")} WHERE id = ?`,
    params
  );
}

export async function eliminarRepostaje(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM repostajes WHERE id = ?", [id]);
}

// ─── Estadísticas ─────────────────────────────────────────────────────────────

export interface GastoMensual {
  anio: number;
  mes: number;
  vehiculo_id: number;
  vehiculo_nombre: string;
  total: number;
}

/** Gasto mensual agrupado por vehículo — para el gráfico Recharts */
export async function getGastoMensual(
  filtros: FiltrosRepostaje = {}
): Promise<GastoMensual[]> {
  const db = await getDb();

  const condiciones: string[] = [];
  const params: (string | number)[] = [];

  if (filtros.vehiculo_id) {
    condiciones.push("r.vehiculo_id = ?");
    params.push(filtros.vehiculo_id);
  }
  if (filtros.fecha_desde) {
    condiciones.push("r.fecha >= ?");
    params.push(filtros.fecha_desde);
  }
  if (filtros.fecha_hasta) {
    condiciones.push("r.fecha <= ?");
    params.push(filtros.fecha_hasta);
  }

  const where =
    condiciones.length > 0 ? `WHERE ${condiciones.join(" AND ")}` : "";

  return db.select<GastoMensual[]>(
    `SELECT
       CAST(strftime('%Y', r.fecha) AS INTEGER) AS anio,
       CAST(strftime('%m', r.fecha) AS INTEGER) AS mes,
       r.vehiculo_id,
       v.nombre AS vehiculo_nombre,
       ROUND(SUM(r.coste), 2) AS total
     FROM repostajes r
     JOIN vehiculos v ON v.id = r.vehiculo_id
     ${where}
     GROUP BY anio, mes, r.vehiculo_id
     ORDER BY anio ASC, mes ASC`,
    params
  );
}

export interface ResumenVehiculo {
  vehiculo_id: number;
  vehiculo_nombre: string;
  vehiculo_matricula: string;
  total_repostajes: number;
  gasto_total: number;
  gasto_medio: number;
  ultimo_repostaje: string | null;
}

/** Resumen por vehículo — para la tabla de estadísticas */
export async function getResumenPorVehiculo(
  filtros: FiltrosRepostaje = {}
): Promise<ResumenVehiculo[]> {
  const db = await getDb();

  const condiciones: string[] = [];
  const params: (string | number)[] = [];

  if (filtros.fecha_desde) {
    condiciones.push("r.fecha >= ?");
    params.push(filtros.fecha_desde);
  }
  if (filtros.fecha_hasta) {
    condiciones.push("r.fecha <= ?");
    params.push(filtros.fecha_hasta);
  }

  const where =
    condiciones.length > 0 ? `WHERE ${condiciones.join(" AND ")}` : "";

  return db.select<ResumenVehiculo[]>(
    `SELECT
       v.id AS vehiculo_id,
       v.nombre AS vehiculo_nombre,
       v.matricula AS vehiculo_matricula,
       COUNT(r.id) AS total_repostajes,
       ROUND(SUM(r.coste), 2) AS gasto_total,
       ROUND(AVG(r.coste), 2) AS gasto_medio,
       MAX(r.fecha) AS ultimo_repostaje
     FROM vehiculos v
     LEFT JOIN repostajes r ON r.vehiculo_id = v.id
     ${where}
     WHERE v.activo = 1
     GROUP BY v.id
     ORDER BY gasto_total DESC NULLS LAST`,
    params
  );
}
