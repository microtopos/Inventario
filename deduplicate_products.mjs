import Database from 'better-sqlite3';
import path from 'path';

const db = new Database('C:\\Users\\dan.pirlitu\\AppData\\Roaming\\Inventario\\inventario.db');

console.log('🔧 Starting deduplication of productos_almacen...\n');

db.exec('PRAGMA foreign_keys = OFF');
db.exec('BEGIN TRANSACTION');

try {
  // Find all duplicate product references
  const duplicates = db.prepare(`
    SELECT referencia, GROUP_CONCAT(id) as ids, COUNT(*) as cnt
    FROM productos_almacen
    GROUP BY referencia
    HAVING cnt > 1
  `).all();

  console.log(`Found ${duplicates.length} duplicate references.\n`);

  let mergedCount = 0;

  for (const dup of duplicates) {
    const ids = dup.ids.split(',').map(Number);
    const keepId = ids[0];
    const toDeleteIds = ids.slice(1);

    console.log(`Processing ${dup.referencia}: keeping ID ${keepId}, deleting ${toDeleteIds.length} duplicates`);

    // Reassign movements from deleted products to the kept product
    for (const deleteId of toDeleteIds) {
      const updateStmt = db.prepare(`
        UPDATE salidas_productos
        SET producto_id = ?
        WHERE producto_id = ?
      `);
      const result = updateStmt.run(keepId, deleteId);
      if (result.changes > 0) {
        console.log(`  Moved ${result.changes} movement(s) from product ID ${deleteId} to ID ${keepId}`);
      }
    }

    // Delete duplicate products (the ones we're not keeping)
    // But first, check if they have any remaining movements (should be zero after reassignment)
    const deleteStmt = db.prepare('DELETE FROM productos_almacen WHERE id = ?');
    for (const deleteId of toDeleteIds) {
      // Verify no movements remain
      const check = db.prepare('SELECT COUNT(*) as cnt FROM salidas_productos WHERE producto_id = ?').get(deleteId);
      if (check.cnt > 0) {
        console.warn(`  Warning: product ID ${deleteId} still has ${check.cnt} movements!`);
      }
      deleteStmt.run(deleteId);
    }

    // Now consolidate movements: merge duplicate entries (same mes, anio, departamento_id)
    // Find any duplicate movement records for the kept product
    const movementDupes = db.prepare(`
      SELECT producto_id, departamento_id, mes, anio, GROUP_CONCAT(id) as ids, SUM(cantidad) as total_cantidad
      FROM salidas_productos
      WHERE producto_id = ?
      GROUP BY producto_id, departamento_id, mes, anio
      HAVING COUNT(*) > 1
    `).all(keepId);

    for (const md of movementDupes) {
      const moveIds = md.ids.split(',').map(Number);
      const keepMoveId = moveIds[0];
      const toDeleteMoveIds = moveIds.slice(1);

      console.log(`  Consolidating movements for ${dup.referencia} (${md.anio}-${md.mes}, dept ${md.departamento_id}): ${moveIds.length} records, total ${md.total_cantidad}`);

      // Update the kept movement record with the sum
      db.prepare('UPDATE salidas_productos SET cantidad = ? WHERE id = ?').run(md.total_cantidad, keepMoveId);

      // Delete the other movement duplicates
      for (const mid of toDeleteMoveIds) {
        db.prepare('DELETE FROM salidas_productos WHERE id = ?').run(mid);
      }
    }

    mergedCount++;
  }

  db.exec('COMMIT');
  db.exec('PRAGMA foreign_keys = ON');

  console.log(`\n✅ Deduplication complete! Merged ${mergedCount} duplicate product references.`);

  // Final verification
  const finalCounts = {
    products: db.prepare('SELECT COUNT(*) as cnt FROM productos_almacen').get().cnt,
    movements: db.prepare('SELECT COUNT(*) as cnt FROM salidas_productos').get().cnt,
    categories: db.prepare('SELECT COUNT(*) as cnt FROM categorias_producto').get().cnt,
  };
  console.log('\n📊 Final counts:', finalCounts);

  // Check for any remaining duplicates
  const remainingDupes = db.prepare(`
    SELECT referencia, COUNT(*) as cnt
    FROM productos_almacen
    GROUP BY referencia
    HAVING cnt > 1
  `).all();
  if (remainingDupes.length > 0) {
    console.warn(`⚠️  Still have ${remainingDupes.length} duplicate references!`);
  } else {
    console.log('✅ No duplicate product references remain.');
  }

} catch (err) {
  db.exec('ROLLBACK');
  db.exec('PRAGMA foreign_keys = ON');
  console.error('❌ Error during deduplication:', err);
  throw err;
} finally {
  db.close();
}
