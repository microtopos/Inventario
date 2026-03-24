import fs from 'fs';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'inventario.db');
const sqlPath = path.join(__dirname, 'migrate_productos.sql');

console.log(`🗄️  Creating database at: ${dbPath}`);
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

console.log('📜 Reading migration SQL...');
const sql = fs.readFileSync(sqlPath, 'utf-8');

console.log('🚀 Executing migration...');
try {
  db.exec(sql);
  console.log('✅ Migration executed successfully!');
} catch (err) {
  console.error('❌ Migration failed:', err);
  process.exit(1);
}

// Verify
console.log('\n🔍 Verifying inserted data...');

const deptCount = db.prepare('SELECT COUNT(*) as cnt FROM departamentos_prod').get();
const catCount = db.prepare('SELECT COUNT(*) as cnt FROM categorias_producto').get();
const prodCount = db.prepare('SELECT COUNT(*) as cnt FROM productos_almacen').get();
const moveCount = db.prepare('SELECT COUNT(*) as cnt FROM salidas_productos').get();

console.log(`  Departments: ${deptCount.cnt}`);
console.log(`  Categories: ${catCount.cnt}`);
console.log(`  Products: ${prodCount.cnt}`);
console.log(`  Movements: ${moveCount.cnt}`);

// Show categories
const categories = db.prepare('SELECT * FROM categorias_producto ORDER BY nombre').all();
console.log('\n📁 Categories:');
categories.forEach(c => console.log(`  - ${c.nombre}`));

// Show products with units
const products = db.prepare('SELECT p.referencia, p.nombre, c.nombre as categoria, p.unidad_medida FROM productos_almacen p JOIN categorias_producto c ON p.categoria_id = c.id ORDER BY c.nombre, p.referencia').all();
console.log(`\n📦 Products (first 10):`);
products.slice(0, 10).forEach(p => console.log(`  ${p.referencia}: ${p.nombre} [${p.categoria}] (${p.unidad_medida})`));

// Show movements by month
const movs = db.prepare('SELECT anio, mes, COUNT(*) as cnt FROM salidas_productos GROUP BY anio, mes ORDER BY anio, mes').all();
console.log('\n📊 Movements by month:');
movs.forEach(m => console.log(`  ${m.anio}-${m.mes}: ${m.cnt} records`));

console.log('\n✅ Done!');
