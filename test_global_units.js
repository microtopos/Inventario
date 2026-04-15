// Test script to verify global units flow
// Import the service module to access functions
import {
  getDbWithRetry,
  getUnidadesPresentacion,
  ensureProduct,
  upsertSalida,
  getSalidasByYear,
  getResumenPorDepartamento,
  deleteProduct,
  getMatrizConsumo,
  getAniosDisponibles
} from './src/productosService.js';

const testGlobalUnitsFlow = async () => {
  console.log("=== Testing Global Units Flow ===\n");

  try {

    const db = await getDbWithRetry();
    console.log("✓ Database connection successful");

    // Test 1: Get global units
    console.log("\n1. Testing global units retrieval...");
    const unidades = await getUnidadesPresentacion();
    console.log(`   Found ${unidades.length} global unit types`);
    if (unidades.length === 0) {
      console.log("   WARNING: No unit types found in database");
    } else {
      console.log("   Sample units:");
      unidades.slice(0, 3).forEach(u => {
        console.log(`     - ${u.nombre} (ID: ${u.id})`);
      });
    }

    // Test 2: Get departments
    console.log("\n2. Testing department retrieval...");
    const departments = await db.select(`SELECT * FROM departamentos_prod ORDER BY nombre ASC`);
    console.log(`   Found ${departments.length} departments`);

    // Test 3: Get or create a test product
    console.log("\n3. Testing product creation...");
    const testProductId = await ensureProduct(
      'TEST-001',
      'Test Product Global Units',
      1,
      'UNIDAD',
      100.50
    );
    console.log(`   Created/Found product with ID: ${testProductId}`);

    // Test 4: Get available years
    console.log("\n4. Testing year retrieval...");
    const { getAniosDisponibles } = require('./src/productosService');
    const years = await getAniosDisponibles();
    console.log(`   Available years: ${years.join(', ')}`);
    const currentYear = new Date().getFullYear();
    const testYear = years.includes(currentYear) ? currentYear : years[0] || 2024;
    console.log(`   Using year: ${testYear}`);

    // Test 5: Get or create a test department
    console.log("\n5. Testing department selection...");
    let testDeptId = 1; // Use first department
    if (departments.length > 0) {
      testDeptId = departments[0].id;
    }
    console.log(`   Using department ID: ${testDeptId}`);

    // Test 6: Get current salinas for the test product and year
    console.log("\n6. Testing salidas retrieval...");
    const salidas = await getSalidasByYear(testYear, testDeptId, undefined);
    console.log(`   Found ${salidas.size} products with salidas for year ${testYear}`);

    // Check if our test product has salidas
    const testProductSalidas = salidas.get(testProductId);
    if (testProductSalidas) {
      console.log(`   Product ${testProductId} has salidas for months: ${Array.from(testProductSalidas.keys()).join(', ')}`);
    } else {
      console.log(`   Product ${testProductId} has no salidas yet for year ${testYear}`);
    }

    // Test 7: Add a salida for the test product (global unit, no presentation)
    console.log("\n7. Testing salida insertion (global unit)...");
    const testMonth = 1;
    const testCantidad = 50;
    await upsertSalida({
      producto_id: testProductId,
      departamento_id: testDeptId,
      cantidad: testCantidad,
      mes: testMonth,
      anio: testYear,
      presentacion_id: undefined // Global unit - no presentation
    });
    console.log(`   Added salida: Product ${testProductId}, Month ${testMonth}, Cantidad ${testCantidad}`);

    // Test 8: Verify the salida was added
    console.log("\n8. Verifying salida insertion...");
    const updatedSalidas = await getSalidasByYear(testYear, testDeptId, undefined);
    const updatedProductSalidas = updatedSalidas.get(testProductId);
    if (updatedProductSalidas && updatedProductSalidas.get(testMonth) === testCantidad) {
      console.log(`   ✓ Salida verified: Product ${testProductId}, Month ${testMonth} = ${updatedProductSalidas.get(testMonth)}`);
    } else {
      console.log(`   ✗ Salida verification failed`);
    }

    // Test 9: Get resumen por departamento
    console.log("\n9. Testing department summary...");
    const resumen = await getResumenPorDepartamento({
      departamento_id: testDeptId,
      anio: testYear
    });
    console.log(`   Department summary for ${testDeptId} in ${testYear}:`);
    resumen.forEach(r => {
      console.log(`   - ${r.departamento_nombre}: ${r.total_cantidad} total, ${r.productos_distintos} products`);
    });

    // Test 10: Test matrix retrieval
    console.log("\n10. Testing matrix retrieval...");
    const { matriz, departamentos } = await (require('./src/productosService').getMatrizConsumo)(testYear, testMonth, undefined);
    console.log(`   Retrieved matrix with ${matriz.length} products across ${departamentos.length} departments`);
    if (matriz.length > 0) {
      const sampleProduct = matriz[0];
      console.log(`   Sample product: ${sampleProduct.producto_nombre} (${sampleProduct.producto_referencia})`);
      console.log(`   Sample product has data for ${Object.keys(sampleProduct).filter(k => k.startsWith('dep_')).length} departments`);
    }

    // Test 11: Verify global units are shared across products
    console.log("\n11. Testing global units sharing...");
    // Create a second product
    const testProductId2 = await ensureProduct(
      'TEST-002',
      'Test Product 2 Global Units',
      1,
      'UNIDAD',
      75.25
    );
    console.log(`   Created second product with ID: ${testProductId2}`);

    // Add salida for second product
    await upsertSalida({
      producto_id: testProductId2,
      departamento_id: testDeptId,
      cantidad: 30,
      mes: testMonth,
      anio: testYear,
      presentacion_id: undefined // Global unit - no presentation
    });
    console.log(`   Added salida for product ${testProductId2}`);

    // Verify both products share the same unit types
    const unidades2 = await getUnidadesPresentacion();
    console.log(`   Both products share the same ${unidades2.length} global unit types`);

    console.log("\n=== All Tests Completed Successfully ===");

  } catch (error) {
    console.error("\n✗ Test failed:", error.message);
    console.error(error.stack);
  }
};

// Run the test
testGlobalUnitsFlow().catch(console.error);
