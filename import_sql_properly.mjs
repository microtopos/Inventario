import fs from 'fs';
import Database from 'better-sqlite3';

const db = new Database('C:\\Users\\dan.pirlitu\\AppData\\Roaming\\Inventario\\inventario.db');

db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

const sql = fs.readFileSync('migrate_productos.sql', 'utf-8');

// Split by semicolon but be smarter about it
const statements = [];
let current = '';
let inString = false;
let stringChar = '';

for (let i = 0; i < sql.length; i++) {
  const char = sql[i];

  if ((char === "'" || char === '"') && sql[i - 1] !== '\\') {
    if (!inString) {
      inString = true;
      stringChar = char;
    } else if (char === stringChar) {
      inString = false;
      stringChar = '';
    }
  }

  if (char === ';' && !inString) {
    statements.push(current.trim());
    current = '';
  } else {
    current += char;
  }
}

if (current.trim()) statements.push(current.trim());

console.log(`📝 Parsed ${statements.length} SQL statements.\n`);

db.exec('BEGIN TRANSACTION');

let errorCount = 0;
let successCount = 0;

for (let i = 0; i < statements.length; i++) {
  const stmt = statements[i];
  if (!stmt) continue;

  try {
    db.exec(stmt);
    successCount++;
  } catch (err) {
    errorCount++;
    // Only log non-constraint errors
    if (!err.message.includes('UNIQUE') && !err.message.includes('constraint')) {
      console.log(`❌ Statement ${i + 1} failed: ${err.message}`);
      console.log('   SQL:', stmt.substring(0, 100) + '...\n');
    }
  }
}

db.exec('COMMIT');

console.log(`\n✅ Transaction completed.`);
console.log(`   Successful: ${successCount} statements`);
console.log(`   Errors (likely duplicates): ${errorCount} statements`);

// Verify
console.log('\n🔍 Verification:');
const counts = {
  departamentos_prod: db.prepare('SELECT COUNT(*) as cnt FROM departamentos_prod').get().cnt,
  categorias_producto: db.prepare('SELECT COUNT(*) as cnt FROM categorias_producto').get().cnt,
  productos_almacen: db.prepare('SELECT COUNT(*) as cnt FROM productos_almacen').get().cnt,
  salidas_productos: db.prepare('SELECT COUNT(*) as cnt FROM salidas_productos').get().cnt,
};

console.log('Counts:', counts);

// Show all categories
console.log('\n📁 Categories:');
db.prepare('SELECT * FROM categorias_producto ORDER BY id').all().forEach(c => {
  console.log(`  ${c.id}. ${c.nombre}`);
});

// Show departments
console.log('\n🏢 Departments (prod):');
db.prepare('SELECT * FROM departamentos_prod').all().forEach(d => {
  console.log(`  ${d.id}. ${d.nombre}`);
});

// Show sample products with categories
console.log('\n📦 Sample products with categories:');
const products = db.prepare(`
  SELECT p.id, p.referencia, p.nombre, p.unidad_medida, c.nombre as categoria
  FROM productos_almacen p
  LEFT JOIN categorias_producto c ON p.categoria_id = c.id
  ORDER BY p.id
  LIMIT 10
`).all();

products.forEach(p => {
  const catName = p.categoria || 'MISSING CATEGORY';
  console.log(`  ${p.id}: ${p.referencia} - ${p.nombre.substring(0, 30)}... (${p.unidad_medida}) [${catName}]`);
});

// Check for any products with invalid category
const invalidCats = db.prepare(`
  SELECT COUNT(*) as cnt FROM productos_almacen
  WHERE categoria_id NOT IN (SELECT id FROM categorias_producto)
`).get().cnt;
if (invalidCats > 0) {
  console.log(`\n⚠️  ${invalidCats} products have invalid category_id!`);
}

// Check for any products with invalid department in movements
const invalidDept = db.prepare(`
  SELECT COUNT(*) as cnt FROM salidas_productos
  WHERE departamento_id NOT IN (SELECT id FROM departamentos_prod)
`).get().cnt;
if (invalidDept > 0) {
  console.log(`\n⚠️  ${invalidDept} movements have invalid departamento_id!`);
}

db.close();
