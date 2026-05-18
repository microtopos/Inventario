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
  if (result.lastInsertId === undefined) {
    throw new Error("No se pudo crear el vehículo");
  }
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

export async function getRepostajesPaginados(
  filtros: FiltrosRepostaje = {},
  pageSize: number,
  offset: number
): Promise<[Repostaje[], number]> {
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

  // Obtener count total y datos en una sola consulta usando ventana
  const query = `
    SELECT
      r.id, r.vehiculo_id, r.fecha, r.coste, r.notas,
      v.nombre AS vehiculo_nombre,
      v.matricula AS vehiculo_matricula,
      COUNT(*) OVER() as total_count
    FROM repostajes r
    JOIN vehiculos v ON v.id = r.vehiculo_id
    ${where}
    ORDER BY r.fecha DESC
    LIMIT ? OFFSET ?
  `;

  params.push(pageSize, offset);
  const results = await db.select<Array<Repostaje & { total_count: number }>>(query, params);

  const total = results.length > 0 ? results[0].total_count : 0;
  const repostajes = results.map(({ total_count, ...rest }) => rest) as Repostaje[];

  return [repostajes, total];
}

export async function crearRepostaje(datos: NuevoRepostaje): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    "INSERT INTO repostajes (vehiculo_id, fecha, coste, notas) VALUES (?, ?, ?, ?)",
    [datos.vehiculo_id, datos.fecha, datos.coste, datos.notas ?? null]
  );
  if (result.lastInsertId === undefined) {
    throw new Error("No se pudo crear el repostaje");
  }
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
// ─── Exportación / Importación JSON ──────────────────────────────────────────

export interface ExportData {
  version: 1;
  exportadoEn: string; // ISO datetime
  vehiculos: Vehiculo[];
  repostajes: Omit<Repostaje, "vehiculo_nombre" | "vehiculo_matricula">[];
}

/**
 * Devuelve todos los vehículos (activos e inactivos) y todos los repostajes
 * listos para serializar a JSON.
 */
export async function exportarDatos(): Promise<ExportData> {
  const db = await getDb();

  const vehiculos = await db.select<Vehiculo[]>(
    "SELECT * FROM vehiculos ORDER BY id ASC"
  );

  const repostajes = await db.select<Omit<Repostaje, "vehiculo_nombre" | "vehiculo_matricula">[]>(
    "SELECT id, vehiculo_id, fecha, coste, notas FROM repostajes ORDER BY id ASC"
  );

  return {
    version: 1,
    exportadoEn: new Date().toISOString(),
    vehiculos,
    repostajes,
  };
}

export type ImportResult = {
  vehiculosInsertados: number;
  vehiculosOmitidos: number;
  repostalesInsertados: number;
  repostalesOmitidos: number;
};

/**
 * Importa datos desde un objeto ExportData.
 * - Los vehículos se upsert por matrícula (si ya existe, se omite).
 * - Los repostajes se insertan siempre; los IDs originales se descartan para
 *   evitar colisiones, y se remapean los vehiculo_id según la matrícula.
 */
export async function importarDatos(data: ExportData): Promise<ImportResult> {
  if (data.version !== 1) {
    throw new Error(`Versión de exportación no soportada: ${data.version}`);
  }

  const db = await getDb();

  let vehiculosInsertados = 0;
  let vehiculosOmitidos = 0;

  // Mapa: id_original → id_real en la base de datos (tras upsert)
  const idMap = new Map<number, number>();

  for (const v of data.vehiculos) {
    const existentes = await db.select<Vehiculo[]>(
      "SELECT * FROM vehiculos WHERE matricula = ?",
      [v.matricula]
    );

    if (existentes.length > 0) {
      // Ya existe: usar su id real
      idMap.set(v.id, existentes[0].id);
      vehiculosOmitidos++;
    } else {
      const result = await db.execute(
        "INSERT INTO vehiculos (matricula, nombre, activo) VALUES (?, ?, ?)",
        [v.matricula, v.nombre, v.activo]
      );
      if (result.lastInsertId === undefined) {
        throw new Error(`No se pudo insertar el vehículo ${v.matricula}`);
      }
      idMap.set(v.id, result.lastInsertId);
      vehiculosInsertados++;
    }
  }

  let repostalesInsertados = 0;
  let repostalesOmitidos = 0;

  for (const r of data.repostajes) {
    const vehiculoIdReal = idMap.get(r.vehiculo_id);
    if (vehiculoIdReal === undefined) {
      // vehiculo_id referenciado no existe en el mapa → omitir
      repostalesOmitidos++;
      continue;
    }

    await db.execute(
      "INSERT INTO repostajes (vehiculo_id, fecha, coste, notas) VALUES (?, ?, ?, ?)",
      [vehiculoIdReal, r.fecha, r.coste, r.notas ?? null]
    );
    repostalesInsertados++;
  }

  return { vehiculosInsertados, vehiculosOmitidos, repostalesInsertados, repostalesOmitidos };
}

export async function getResumenPorVehiculo(
  filtros: FiltrosRepostaje = {}
): Promise<ResumenVehiculo[]> {
  const db = await getDb();

  const condiciones: string[] = [];
  const params: (string | number)[] = [];

  // Siempre incluir solo vehículos activos
  condiciones.push("v.activo = 1");

  if (filtros.vehiculo_id) {
    condiciones.push("v.id = ?");
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
     GROUP BY v.id
     ORDER BY gasto_total DESC NULLS LAST`,
    params
  );
}
