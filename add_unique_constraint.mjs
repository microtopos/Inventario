import Database from 'better-sqlite3';
import path from 'path';

const dbPath = 'C:\\Users\\dan.pirlitu\\AppData\\Roaming\\Inventario\\inventario.db';
const db = new Database(dbPath);

console.log('🗄️  Connecting to database:', dbPath);

// Check if the index already exists
const indexExists = db.prepare(`
  SELECT name FROM sqlite_master
  WHERE type='index' AND name='idx_productos_referencia_unica'
`).get();

if (indexExists) {
  console.log('✅ Unique index already exists on productos_almacen(referencia)');
} else {
  console.log('➕ Creating unique index on productos_almacen(referencia)...');
  try {
    db.exec('CREATE UNIQUE INDEX idx_productos_referencia_unica ON productos_almacen(referencia)');
    console.log('✅ Unique index created successfully.');
  } catch (err) {
    console.error('❌ Failed to create index:', err.message);
    console.log('This may be due to existing duplicate references. Run deduplication first.');
    process.exit(1);
  }
}

// Verify
const result = db.prepare('SELECT COUNT(*) as total, COUNT(DISTINCT referencia) as unique_refs FROM productos_almacen').get();
console.log(`\n📊 Products in table: ${result.total} total, ${result.unique_refs} unique references`);

if (result.total !== result.unique_refs) {
  console.warn('⚠️  Warning: There are still duplicate references!');
  const dupes = db.prepare(`
    SELECT referencia, COUNT(*) as cnt
    FROM productos_almacen
    GROUP BY referencia
    HAVING cnt > 1
  `).all();
  console.log('Duplicates:', dupes);
} else {
  console.log('✅ All product references are unique.');
}

db.close();
console.log('\n✅ Done.');
