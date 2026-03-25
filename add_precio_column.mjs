/**
 * Script de migración para añadir la columna 'precio' a la tabla productos_almacen
 * Ejecutar: node add_precio_column.mjs
 *
 * Este script es un respaldo para la migración Tauri versión 6.
 * Usar si la migración automática de Tauri no se ejecutó correctamente.
 */

import { open, Database } from 'sqlite';
import * as fs from 'fs';
import * as path from 'path';

const DB_PATH = path.resolve(process.cwd(), 'inventario.db');

async function runMigration() {
  console.log('🔧 Iniciando migración: añadir columna precio a productos_almacen...');

  // Verificar que la base de datos existe
  if (!fs.existsSync(DB_PATH)) {
    console.error('❌ Base de datos no encontrada en:', DB_PATH);
    console.log('💡 Ejecuta primero la aplicación para que se cree la base de datos.');
    process.exit(1);
  }

  try {
    const db = await open({
      filename: DB_PATH,
      driver: Database
    });

    // Verificar si la columna ya existe
    const columns = await db.pragma('table_info(productos_almacen)');
    const hasPrecioColumn = columns.some((col: any) => col.name === 'precio');

    if (hasPrecioColumn) {
      console.log('✅ La columna "precio" ya existe en productos_almacen.');
    } else {
      // Añadir columna precio
      await db.exec(`
        ALTER TABLE productos_almacen
        ADD COLUMN precio DECIMAL(10,2) DEFAULT NULL;
      `);
      console.log('✅ Columna "precio" añadida exitosamente.');
    }

    // Verificar resultado
    const finalColumns = await db.pragma('table_info(productos_almacen)');
    console.log('\n📊 Estructura actual de productos_almacen:');
    finalColumns.forEach((col: any) => {
      console.log(`   - ${col.name} (${col.type})${col.notnull ? ' NOT NULL' : ''}${col.dflt_value ? ` DEFAULT ${col.dflt_value}` : ''}`);
    });

    await db.close();
    console.log('\n🎉 Migración completada con éxito.');
    process.exit(0);

  } catch (error: any) {
    console.error('❌ Error durante la migración:', error.message);
    console.log('\n💡 Posibles soluciones:');
    console.log('   1. Asegúrate de que la aplicación Tauri esté cerrada.');
    console.log('   2. Si el error persiste, verifica los permisos del archivo de base de datos.');
    process.exit(1);
  }
}

runMigration().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
