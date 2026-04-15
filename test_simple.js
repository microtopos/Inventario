// Simple test to verify the database operations work
import { open } from '@tauri-apps/plugin-sql';

async function testDatabase() {
  console.log("=== Testing Database Operations ===\n");

  try {
    // Open the database
    const db = await open("sqlite:inventario.db");
    console.log("✓ Database opened successfully");

    // Test 1: Check if tables exist
    console.log("\n1. Checking tables...");
    const tables = await db.select(`SELECT name FROM sqlite_master WHERE type='table'`);
    console.log(`   Found ${tables.length} tables:`);
    tables.forEach(t => console.log(`   - ${t.name}`));

    // Test 2: Get units
    console.log("\n2. Getting units of presentation...");
    const units = await db.select(`SELECT * FROM unidades_presentacion ORDER BY nombre`);
    console.log(`   Found ${units.length} units`);
    units.forEach(u => console.log(`   - ${u.nombre} (ID: ${u.id})`));

    // Test 3: Get departments
    console.log("\n3. Getting departments...");
    const depts = await db.select(`SELECT * FROM departamentos_prod ORDER BY nombre`);
    console.log(`   Found ${depts.length} departments`);
    depts.forEach(d => console.log(`   - ${d.nombre} (ID: ${d.id})`));

    // Test 4: Get products
    console.log("\n4. Getting products...");
    const products = await db.select(`SELECT id, referencia, nombre, unidad_medida, precio FROM productos_almacen WHERE activo = 1 ORDER BY referencia LIMIT 5`);
    console.log(`   Found ${products.length} active products (showing first 5)`);
    products.forEach(p => console.log(`   - ${p.referencia}: ${p.nombre}`));

    // Test 5: Insert a test unit if none exists
    console.log("\n5. Testing unit insertion...");
    if (units.length === 0) {
      const result = await db.execute(`INSERT INTO unidades_presentacion (nombre) VALUES (?)`, ['Test Unit']);
      console.log(`   Inserted test unit with ID: ${result.lastInsertId}`);
    } else {
      console.log(`   Skipping - units already exist`);
    }

    // Test 6: Test product upsert
    console.log("\n6. Testing product upsert...");
    const testRef = 'TEST-' + Date.now();
    const result = await db.execute(
      `INSERT OR REPLACE INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, precio, activo)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [testRef, 'Test Product', 1, 'UNIDAD', 100.00]
    );
    console.log(`   Upserted product ${testRef}`);

    // Test 7: Test salida insertion
    console.log("\n7. Testing salida insertion...");
    const now = new Date();
    const testSalida = await db.execute(
      `INSERT INTO salidas_productos (producto_id, departamento_id, presentacion_id, cantidad, mes, anio)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [1, 1, null, 50, now.getMonth() + 1, now.getFullYear()]
    );
    console.log(`   Inserted salida with changes: ${testSalida.changes}`);

    // Test 8: Verify salidas
    console.log("\n8. Verifying salidas...");
    const salidas = await db.select(`SELECT * FROM salidas_productos WHERE producto_id = 1 ORDER BY anio DESC, mes DESC LIMIT 5`);
    console.log(`   Found ${salidas.length} salidas for product 1`);
    salidas.forEach(s => {
      console.log(`   - Product: ${s.producto_id}, Dept: ${s.departamento_id}, Mes: ${s.mes}, Anio: ${s.anio}, Cantidad: ${s.cantidad}`);
    });

    // Test 9: Test getSalidasByYear function
    console.log("\n9. Testing getSalidasByYear query...");
    const year = now.getFullYear();
    const salidasByYear = await db.select(`
      SELECT
        s.producto_id,
        s.departamento_id,
        s.cantidad,
        s.mes,
        s.anio,
        p.referencia,
        p.nombre
      FROM salidas_productos s
      JOIN productos_almacen p ON p.id = s.producto_id
      WHERE s.anio = ?
      ORDER BY s.producto_id, s.mes
    `, [year]);
    console.log(`   Found ${salidasByYear.length} salidas for year ${year}`);

    // Test 10: Test upsertSalida with specific presentation
    console.log("\n10. Testing upsertSalida with presentation...");
    // First get or create a unit
    const unitResult = await db.select(`SELECT id FROM unidades_presentacion LIMIT 1`);
    if (unitResult.length > 0) {
      const unitId = unitResult[0].id;
      // Get or create a presentation for product 1
      const presResult = await db.select(`SELECT id FROM producto_presentaciones WHERE producto_id = 1 AND unidad_id = ? LIMIT 1`, [unitId]);
      let presId;
      if (presResult.length > 0) {
        presId = presResult[0].id;
      } else {
        const presInsert = await db.execute(
          `INSERT INTO producto_presentaciones (producto_id, unidad_id, precio) VALUES (?, ?, ?)`,
          [1, unitId, 150.00]
        );
        presId = presInsert.lastInsertId;
        console.log(`   Created presentation with ID: ${presId}`);
      }

      // Now upsert with presentation
      const salidaResult = await db.execute(
        `INSERT OR REPLACE INTO salidas_productos (producto_id, departamento_id, presentacion_id, cantidad, mes, anio)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [1, 1, presId, 25, now.getMonth() + 1, year]
      );
      console.log(`   Upserted salida with presentation (changes: ${salidaResult.changes})`);
    } else {
      console.log(`   Skipping - no units found`);
    }

    console.log("\n=== All Database Tests Completed ===");

  } catch (error) {
    console.error("\n✗ Test failed:", error.message);
    console.error(error.stack);
  }
}

// Run the test
testDatabase().catch(console.error);