import fs from 'fs';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Connect to the existing database in AppData
const dbPath = path.join(process.env.APPDATA || 'C:\\Users\\dan.pirlitu\\AppData\\Roaming', 'Inventario', 'inventario.db');
console.log(`📂 Connecting to database: ${dbPath}`);

if (!fs.existsSync(dbPath)) {
  console.error('❌ Database not found at:', dbPath);
  console.log('Please run the app first to create the database structure.');
  process.exit(1);
}

const db = new Database(dbPath);
console.log('✅ Connected to existing database.\n');

// Read the migration SQL (only the data insertion part)
const sqlPath = path.join(__dirname, 'migrate_productos.sql');
const sql = fs.readFileSync(sqlPath, 'utf-8');

// Parse and execute only INSERT statements, skipping schema creation
console.log('📦 Processing migration data...');
const statements = sql.split(';').filter(stmt => stmt.trim().startsWith('INSERT'));

let insertedDept = 0, insertedCat = 0, insertedProd = 0, insertedMov = 0;

for (const stmt of statements) {
  try {
    const trimmed = stmt.trim();
    if (!trimmed) continue;

    const result = db.exec(trimmed + ';');

    // Track counts based on table name
    if (trimmed.includes('departamentos_prod')) insertedDept++;
    else if (trimmed.includes('categorias_producto')) insertedCat++;
    else if (trimmed.includes('productos_almacen')) insertedProd++;
    else if (trimmed.includes('salidas_productos')) insertedMov++;
  } catch (err) {
    // Ignore IGNORE errors (duplicate entries)
    if (!err.message.includes('SQLITE_CONSTRAINT')) {
      console.warn('⚠️  Statement failed (may be expected):', err.message);
    }
  }
}

console.log('✅ Migration applied (INSERT OR IGNORE used for duplicates)\n');

// Verify
console.log('🔍 Verifying data in existing database...');

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
if (categories.length > 0) {
  console.log('\n📁 Categories:');
  categories.forEach(c => console.log(`  - ${c.nombre}`));
}

// Show products with units (first 10)
const products = db.prepare('SELECT p.referencia, p.nombre, c.nombre as categoria, p.unidad_medida FROM productos_almacen p JOIN categorias_producto c ON p.categoria_id = c.id ORDER BY c.nombre, p.referencia').all();
if (products.length > 0) {
  console.log(`\n📦 Products (showing first 10 of ${products.length}):`);
  products.slice(0, 10).forEach(p => console.log(`  ${p.referencia}: ${p.nombre.substring(0, 40)} [${p.categoria}] (${p.unidad_medida})`));
}

// Show movements summary
const movs = db.prepare('SELECT anio, mes, COUNT(*) as cnt FROM salidas_productos GROUP BY anio, mes ORDER BY anio, mes').all();
if (movs.length > 0) {
  console.log('\n📊 Movements by month:');
  movs.forEach(m => console.log(`  ${m.anio}-${m.mes.toString().padStart(2, '0')}: ${m.cnt} records`));
}

console.log('\n✅ Data migration complete!');
db.close();
