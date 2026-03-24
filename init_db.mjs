import fs from 'fs';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'inventario.db');

// Remove existing database if it exists (for clean migration)
if (fs.existsSync(dbPath)) {
  console.log('🗑️  Removing existing database...');
  fs.unlinkSync(dbPath);
}

console.log(`🗄️  Creating database at: ${dbPath}`);
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Full schema from src-tauri/src/lib.rs (only the table creation parts)
const schema = `
-- DEPARTAMENTOS (clothing module)
CREATE TABLE IF NOT EXISTS departamentos (
    id     INTEGER PRIMARY KEY,
    nombre TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS colores (
    id     INTEGER PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE
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
    fecha_recibido TEXT
);

CREATE TABLE IF NOT EXISTS pedido_items (
    id        INTEGER PRIMARY KEY,
    pedido_id INTEGER NOT NULL REFERENCES pedidos(id),
    talla_id  INTEGER NOT NULL REFERENCES tallas(id),
    cantidad  INTEGER NOT NULL
);

-- PRODUCTOS MODULE (cleaning supplies)
CREATE TABLE IF NOT EXISTS categorias_producto (
    id     INTEGER PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS productos_almacen (
    id           INTEGER PRIMARY KEY,
    referencia   TEXT NOT NULL,
    nombre       TEXT NOT NULL,
    categoria_id INTEGER NOT NULL REFERENCES categorias_producto(id),
    unidad_medida TEXT NOT NULL,
    activo       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS departamentos_prod (
    id     INTEGER PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS salidas_productos (
    id               INTEGER PRIMARY KEY,
    producto_id      INTEGER NOT NULL REFERENCES productos_almacen(id),
    departamento_id  INTEGER NOT NULL REFERENCES departamentos_prod(id),
    cantidad         INTEGER NOT NULL DEFAULT 0,
    mes              INTEGER NOT NULL CHECK(mes BETWEEN 1 AND 12),
    anio             INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_salidas_unica
    ON salidas_productos(producto_id, departamento_id, mes, anio);

-- VEHICULOS MODULE
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
`;

console.log('🏗️  Creating schema...');
db.exec(schema);
console.log('✅ Schema created.');

// Insert seed data for clothing module colors
console.log('🌱 Seeding colores...');
db.exec(`
INSERT OR IGNORE INTO colores (nombre) VALUES
    ('Azul marino'),
    ('Azul celeste'),
    ('Blanco'),
    ('Negro'),
    ('Rojo'),
    ('Verde'),
    ('Amarillo'),
    ('Rosa'),
    ('Gris'),
    ('Morado');
`);
console.log('✅ Colores seeded.');

// Now run the cleaning products migration
console.log('\n📦 Running cleaning products migration...');
const sqlPath = path.join(__dirname, 'migrate_productos.sql');
const migrationSql = fs.readFileSync(sqlPath, 'utf-8');
db.exec(migrationSql);
console.log('✅ Migration data imported.');

// Verify
console.log('\n🔍 Verifying data...');

const deptCount = db.prepare('SELECT COUNT(*) as cnt FROM departamentos_prod').get();
const catCount = db.prepare('SELECT COUNT(*) as cnt FROM categorias_producto').get();
const prodCount = db.prepare('SELECT COUNT(*) as cnt FROM productos_almacen').get();
const moveCount = db.prepare('SELECT COUNT(*) as cnt FROM salidas_productos').get();

console.log(`  Departments (prod): ${deptCount.cnt}`);
console.log(`  Categories: ${catCount.cnt}`);
console.log(`  Products: ${prodCount.cnt}`);
console.log(`  Movements: ${moveCount.cnt}`);

// Show categories
const categories = db.prepare('SELECT * FROM categorias_producto ORDER BY nombre').all();
console.log('\n📁 Categories:');
categories.forEach(c => console.log(`  - ${c.nombre}`));

// Show products with units
const products = db.prepare('SELECT p.referencia, p.nombre, c.nombre as categoria, p.unidad_medida FROM productos_almacen p JOIN categorias_producto c ON p.categoria_id = c.id ORDER BY c.nombre, p.referencia').all();
console.log(`\n📦 Products (${products.length} total, showing first 15):`);
products.slice(0, 15).forEach(p => console.log(`  ${p.referencia.padEnd(12)}: ${p.nombre.substring(0, 40).padEnd(40)} [${p.categoria}] (${p.unidad_medida})`));

// Show movements by month
const movs = db.prepare('SELECT anio, mes, COUNT(*) as cnt FROM salidas_productos GROUP BY anio, mes ORDER BY anio, mes').all();
console.log('\n📊 Movements by month:');
movs.forEach(m => console.log(`  ${m.anio}-${m.mes.toString().padStart(2, '0')}: ${m.cnt} records`));

// Show summary of movements with product details
const movDetails = db.prepare(`
SELECT p.referencia, p.nombre, s.cantidad, s.mes, s.anio
FROM salidas_productos s
JOIN productos_almacen p ON s.producto_id = p.id
ORDER BY s.anio, s.mes, p.referencia
`).all();
console.log(`\n📋 Movement details (${movDetails.length} total):`);
movDetails.forEach(m => console.log(`  ${m.anio}-${m.mes.toString().padStart(2, '0')}: ${m.referencia} - ${m.nombre.substring(0, 30)}: ${m.cantidad}`));

console.log('\n✅ Database setup complete!');
db.close();
