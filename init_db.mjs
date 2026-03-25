/**
 * Script de inicialización de base de datos completa
 * Ejecutar: node init_db.mjs
 *
 * Este script crea todas las tablas necesarias para la aplicación,
 * incluyendo la columna 'precio' en productos_almacen.
 * Es un respaldo para desarrollo sin Tauri o para crear DBs nuevas.
 */

import { open, Database } from 'sqlite';
import * as fs from 'fs';
import * as path from 'path';

const DB_PATH = path.resolve(process.cwd(), 'inventario.db');

async function initDatabase() {
  console.log('🗄️  Inicializando base de datos...');

  // Si la DB ya existe, preguntar confirmación
  if (fs.existsSync(DB_PATH)) {
    const { stdout } = await import('node:process');
    console.log(`⚠️  La base de datos ya existe en: ${DB_PATH}`);
    console.log('   Se recomienda hacer una copia de seguridad antes de continuar.');
    // Por seguridad, no continuamos sin confirmación explícita
    console.log('   Para recrear la DB, borra el archivo manualmente.');
    process.exit(1);
  }

  try {
    const db = await open({
      filename: DB_PATH,
      driver: Database
    });

    // Configurar pragmas para evitar bloqueos
    console.log('⚙️  Configurando pragmas...');
    await db.exec('PRAGMA busy_timeout = 10000;');
    await db.exec('PRAGMA journal_mode = WAL;');

    // Crear tablas en orden (respetando dependencias)
    console.log('📦 Creando tablas...');

    // 1. Tablas originales de productos/ropa
    await db.exec(`
      CREATE TABLE IF NOT EXISTS departamentos (
          id     INTEGER PRIMARY KEY,
          nombre TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS productos (
          id             INTEGER PRIMARY KEY,
          codigo         TEXT,
          nombre         TEXT NOT NULL,
          departamento_id INTEGER REFERENCES departamentos(id),
          color          TEXT,
          foto           TEXT
      );

      CREATE TABLE IF NOT EXISTS tallas (
          id          INTEGER PRIMARY KEY,
          producto_id INTEGER NOT NULL REFERENCES productos(id),
          talla       TEXT    NOT NULL,
          stock       INTEGER NOT NULL DEFAULT 0,
          UNIQUE(producto_id, talla)
      );

      CREATE TABLE IF NOT EXISTS movimientos (
          id       INTEGER PRIMARY KEY,
          talla_id INTEGER NOT NULL REFERENCES tallas(id),
          cambio   INTEGER NOT NULL,
          origen   TEXT NOT NULL DEFAULT 'manual',
          fecha    TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
      );

      CREATE TABLE IF NOT EXISTS pedidos (
          id             INTEGER PRIMARY KEY,
          fecha          TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
          recibido       INTEGER NOT NULL DEFAULT 0,
          fecha_recibido TEXT,
          borrador       INTEGER NOT NULL DEFAULT 0,
          notas          TEXT
      );

      CREATE TABLE IF NOT EXISTS pedido_items (
          id                INTEGER PRIMARY KEY,
          pedido_id         INTEGER NOT NULL REFERENCES pedidos(id),
          talla_id          INTEGER NOT NULL REFERENCES tallas(id),
          cantidad          INTEGER NOT NULL,
          cantidad_acordada INTEGER,
          cantidad_recibida INTEGER NOT NULL DEFAULT 0,
          estado            TEXT NOT NULL DEFAULT 'pendiente'
      );

      CREATE TABLE IF NOT EXISTS colores (
          id     INTEGER PRIMARY KEY,
          nombre TEXT NOT NULL UNIQUE
      );

      INSERT INTO colores (nombre) VALUES
          ('Azul marino'),
          ('Azul celeste'),
          ('Blanco'),
          ('Negro'),
          ('Rojo'),
          ('Verde');
    `);

    console.log('   ✅ Tablas de productos/ropa creadas');

    // 2. Tablas de productos de limpieza (módulo productos)
    await db.exec(`
      CREATE TABLE IF NOT EXISTS categorias_producto (
          id     INTEGER PRIMARY KEY,
          nombre TEXT NOT NULL UNIQUE
      );

      CREATE TABLE IF NOT EXISTS productos_almacen (
          id             INTEGER PRIMARY KEY,
          referencia     TEXT NOT NULL,
          nombre         TEXT NOT NULL,
         ategoria_id   INTEGER NOT NULL REFERENCES categorias_producto(id),
          unidad_medida  TEXT NOT NULL,
          activo         INTEGER NOT NULL DEFAULT 1,
          precio         DECIMAL(10,2) DEFAULT NULL
      );

      CREATE TABLE IF NOT EXISTS departamentos_prod (
          id     INTEGER PRIMARY KEY,
          nombre TEXT NOT NULL UNIQUE
      );

      CREATE TABLE IF NOT EXISTS salidas_productos (
          id              INTEGER PRIMARY KEY,
          producto_id     INTEGER NOT NULL REFERENCES productos_almacen(id),
          departamento_id INTEGER NOT NULL REFERENCES departamentos_prod(id),
          cantidad        INTEGER NOT NULL DEFAULT 0,
          mes             INTEGER NOT NULL CHECK(mes BETWEEN 1 AND 12),
          anio            INTEGER NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_salidas_unica
          ON salidas_productos(producto_id, departamento_id, mes, anio);
    `);

    console.log('   ✅ Tablas de productos de limpieza creadas');

    // 3. Tablas de vehículos/gasolina
    await db.exec(`
      CREATE TABLE IF NOT EXISTS vehiculos (
          id        INTEGER PRIMARY KEY,
          matricula TEXT NOT NULL,
          nombre    TEXT NOT NULL,
          activo    INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS repostajes (
          id          INTEGER PRIMARY KEY,
          vehiculo_id INTEGER NOT NULL REFERENCES vehiculos(id),
          fecha       TEXT    NOT NULL,
          coste       REAL    NOT NULL,
          notas       TEXT
      );
    `);

    console.log('   ✅ Tablas de gasolina creadas');

    await db.close();

    console.log('\n🎉 Base de datos inicializada correctamente en:', DB_PATH);
    console.log('📝 Próximos pasos:');
    console.log('   1. Inicia la aplicación Tauri (npm run tauri)');
    console.log('   2. Las migraciones adicionales se aplicarán automáticamente');
    console.log('\n✅ Listo.');
    process.exit(0);

  } catch (error: any) {
    console.error('❌ Error durante la inicialización:', error.message);
    process.exit(1);
  }
}

initDatabase().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
