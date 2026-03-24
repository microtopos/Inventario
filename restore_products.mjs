import fs from 'fs';
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = 'C:\\Users\\dan.pirlitu\\AppData\\Roaming\\Inventario\\inventario.db';
const db = new Database(dbPath);

console.log('🗄️  Connecting to database:', dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Check current state
const before = db.prepare('SELECT COUNT(*) as cnt FROM productos_almacen').get();
console.log(`📊 Current products in database: ${before.cnt}`);

// Read the migration SQL
const sqlPath = path.join(process.cwd(), 'migrate_productos.sql');
const sql = fs.readFileSync(sqlPath, 'utf-8');

console.log('\n📦 Starting import...\n');

// Split into statements
const rawStatements = sql.split(';').map(s => s.trim()).filter(s => s);

let inserted = {
  departamento: 0,
  categoria: 0,
  producto: 0,
  salida: 0
};

// Use a transaction
db.exec('BEGIN TRANSACTION');

try {
  for (const raw of rawStatements) {
    if (!raw.toUpperCase().startsWith('INSERT')) continue;

    const stmt = raw + ';';

    try {
      const result = db.exec(stmt);

      if (raw.includes('departamentos_prod')) {
        inserted.departamento++;
      } else if (raw.includes('categorias_producto')) {
        inserted.categoria++;
      } else if (raw.includes('productos_almacen')) {
        inserted.producto++;
      } else if (raw.includes('salidas_productos')) {
        inserted.salida++;
      }
    } catch (err) {
      // If it's a UNIQUE constraint violation, that's okay (already exists)
      if (!err.message.includes('SQLITE_CONSTRAINT') && !err.message.includes('UNIQUE')) {
        console.warn('⚠️  Error inserting:', err.message);
      }
    }
  }

  db.exec('COMMIT');
} catch (err) {
  db.exec('ROLLBACK');
  console.error('❌ Transaction failed:', err);
  throw err;
}

console.log('✅ Import completed.\n');
console.log('Inserted (attempted):', inserted);

// Verify
const after = db.prepare('SELECT COUNT(*) as cnt FROM productos_almacen').get();
console.log(`\n🔍 Verification:`);
console.log(`  Total products: ${after.cnt}`);
const cats = db.prepare('SELECT COUNT(*) as cnt FROM categorias_producto').get();
console.log(`  Total categories: ${cats.cnt}`);
const depts = db.prepare('SELECT COUNT(*) as cnt FROM departamentos_prod').get();
console.log(`  Total departments (prod): ${depts.cnt}`);
const moves = db.prepare('SELECT COUNT(*) as cnt FROM salidas_productos').get();
console.log(`  Total movements: ${moves.cnt}`);

// Show sample products
if (after.cnt > 0) {
  const sample = db.prepare(`
    SELECT p.referencia, p.nombre, c.nombre as categoria, p.unidad_medida
    FROM productos_almacen p
    JOIN categorias_producto c ON p.categoria_id = c.id
    ORDER BY c.nombre, p.referencia
    LIMIT 5
  `).all();
  console.log('\n📦 Sample products:');
  sample.forEach(p => console.log(`  ${p.referencia}: ${p.nombre.substring(0, 40)} [${p.categoria}] (${p.unidad_medida})`));
}

db.close();
console.log('\n✅ Done.');
