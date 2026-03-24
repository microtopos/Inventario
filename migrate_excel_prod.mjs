import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, 'PEDIDO LIMPIEZ DESARROLLO.xlsx');
const workbook = XLSX.readFile(filePath);

// Get the only sheet
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

console.log(`📊 Processing sheet: "${sheetName}" with ${data.length} rows`);

if (data.length < 3) {
  console.error('❌ Not enough rows in sheet');
  process.exit(1);
}

// Find the header row that contains month names
const monthNames = ['ENE', 'ENERO', 'FEB', 'FEBRERO', 'MAR', 'MARZO', 'ABR', 'ABRIL', 'MAY', 'JUNIO', 'JUL', 'JULIO', 'AGO', 'AGOSTO', 'SET', 'SEPTIEMBRE', 'OCT', 'OCTUBRE', 'NOV', 'NOVIEMBRE', 'DIC', 'DICIEMBRE'];
let headerRowIndex = 0;
let headerRow = data[0];
for (let i = 0; i < Math.min(5, data.length); i++) {
  const row = data[i];
  const rowStr = row.map(c => String(c || '')).join(' ').toUpperCase();
  if (monthNames.some(m => rowStr.includes(m))) {
    headerRowIndex = i;
    headerRow = row;
    break;
  }
}
console.log(`Using row ${headerRowIndex} as header:`, headerRow);

// Determine month column indices
const monthColIndices = [];
const monthNamesFound = [];
headerRow.forEach((cell, idx) => {
  if (idx < 2) return; // skip reference and description columns
  const hdr = String(cell || '').toUpperCase();
  for (const m of monthNames) {
    if (hdr.includes(m)) {
      monthColIndices.push(idx);
      monthNamesFound.push(cell);
      break;
    }
  }
});

if (monthColIndices.length === 0) {
  console.warn('⚠️  No month columns detected by header name, using columns 3,4,5 as months.');
  // We assume reference idx0, desc idx1, then month cols idx3-5? Actually typical: idx2 is quantity? We'll use idx 3,4,5 for Enero, Febrero, Marzo if they exist.
  if (headerRow.length >= 6) {
    monthColIndices = [3, 4, 5];
    monthNamesFound = headerRow.slice(3, 6);
  } else if (headerRow.length >= 5) {
    monthColIndices = [2, 3, 4];
    monthNamesFound = headerRow.slice(2, 5);
  } else {
    console.error('❌ Cannot determine month columns');
    process.exit(1);
  }
}
console.log('Detected month columns:', monthColIndices, 'names:', monthNamesFound);

// Parse categories and products
const categories = [];
const products = [];
let currentCategory = null;

// Header patterns to skip (col headers)
const headerPatterns = [
  /^N[º°]?\s*REFERENCIA$/i,
  /^DESCRIPCION$/i,
  /^CANTIDAD$/i,
  /^MES$/i,
  /^ENERO$/i,
  /^FEBRERO$/i,
  /^MARZO$/i,
];

// Start from row after headerRow
for (let i = headerRowIndex + 1; i < data.length; i++) {
  const row = data[i];
  if (!row || row.length === 0) continue;

  const ref = row[0];
  const desc = row[1];

  const refStr = (ref ?? '').toString().trim();
  const descStr = (desc ?? '').toString().trim();

  // Skip header-like rows
  if (headerPatterns.some(pattern => pattern.test(refStr))) {
    console.log(`Skipping header-like row at index ${i}: "${refStr}"`);
    continue;
  }

  // Category row: reference non-empty and description empty
  if (refStr !== '' && descStr === '') {
    let cat = refStr;
    // Fix common typos
    if (cat.toUpperCase().includes('LUIMPIEZA')) {
      cat = cat.replace(/LUIMPIEZA/gi, 'LIMPIEZA');
    }
    currentCategory = cat;
    if (!categories.includes(currentCategory)) {
      categories.push(currentCategory);
      console.log(`Category detected: ${currentCategory}`);
    }
    continue;
  }

  // If reference is empty, skip
  if (refStr === '') continue;

  // Product row
  const productRef = refStr;
  const productDesc = descStr;
  const cantidadRaw = row[2]; // CANTIDAD column (unit/packaging info)
  const unidadMedida = (cantidadRaw ?? '').toString().trim() || 'unidad';

  // Extract quantities for each month
  const cantidades = monthColIndices.map(colIdx => {
    const raw = row[colIdx];
    if (raw === undefined || raw === null || raw === '') return 0;
    // Parse quantity: extract leading number
    const numStr = String(raw).trim().split(/\s+/)[0];
    const num = parseInt(numStr, 10);
    return isNaN(num) ? 0 : num;
  });

  // Clean category name: fix common typos
  let catNombre = currentCategory || 'SIN CATEGORÍA';
  if (catNombre.toUpperCase().includes('LUIMPIEZA')) {
    catNombre = catNombre.replace(/LUIMPIEZA/gi, 'LIMPIEZA');
  }

  products.push({
    referencia: productRef,
    descripcion: productDesc,
    categoria_nombre: catNombre,
    cantidades,
    unidad_medida: unidadMedida,
  });
}

console.log(`\n✅ Parsed ${categories.length} categories:`);
categories.forEach(c => console.log('  -', c));
console.log(`\n✅ Parsed ${products.length} products (first 10):`);
products.slice(0, 10).forEach(p => console.log(`  ${p.referencia}: ${p.descripcion} (${p.categoria_nombre})`));

// Department name derived from Excel filename
const departamentoNombre = 'DESARROLLO';

// Build SQL script
let sql = '-- Migration script for Productos module from Excel\n';
sql += '-- Generated on ' + new Date().toISOString() + '\n\n';

// 1. Insert department
sql += `-- Department: ${departamentoNombre}\n`;
sql += `INSERT OR IGNORE INTO departamentos_prod (nombre) VALUES ('${departamentoNombre.replace(/'/g, "''")}');\n\n`;

// 2. Insert categories
sql += '-- Categories\n';
for (const cat of categories) {
  sql += `INSERT OR IGNORE INTO categorias_producto (nombre) VALUES ('${cat.replace(/'/g, "''")}');\n`;
}
sql += '\n';

// 3. Insert products (with unidad_medida from CANTIDAD column)
sql += '-- Products\n';
for (const p of products) {
  const catNombre = p.categoria_nombre.replace(/'/g, "''");
  const unidad = (p.unidad_medida || 'unidad').toLowerCase().replace(/'/g, "''");
  sql += `INSERT INTO productos_almacen (referencia, nombre, categoria_id, unidad_medida, activo) VALUES (\n`;
  sql += `  '${p.referencia.replace(/'/g, "''")}',\n`;
  sql += `  '${p.descripcion.replace(/'/g, "''")}',\n`;
  sql += `  (SELECT id FROM categorias_producto WHERE nombre = '${catNombre}'),\n`;
  sql += `  '${unidad}',\n`;
  sql += `  1\n`;
  sql += `);\n`;
}
sql += '\n';

// 4. Insert movements (salidas) for each month column
sql += '-- Movements (salidas_productos)\n';
for (const p of products) {
  // Only insert months where quantity > 0
  for (let idx = 0; idx < monthColIndices.length; idx++) {
    const cantidad = p.cantidades[idx];
    if (cantidad <= 0) continue;
    const mes = idx + 1; // assuming months in order: Enero=1, Febrero=2, Marzo=3
    const anio = 2025; // from "PRIMER TRIMESTRE 2025"
    sql += `INSERT INTO salidas_productos (producto_id, departamento_id, cantidad, mes, anio) VALUES (\n`;
    sql += `  (SELECT id FROM productos_almacen WHERE referencia = '${p.referencia.replace(/'/g, "''")}'),\n`;
    sql += `  (SELECT id FROM departamentos_prod WHERE nombre = '${departamentoNombre.replace(/'/g, "''")}'),\n`;
    sql += `  ${cantidad},\n`;
    sql += `  ${mes},\n`;
    sql += `  ${anio}\n`;
    sql += `);\n`;
  }
}
sql += '\n-- Migration completed.\n';

// Write SQL file
const outPath = path.join(__dirname, 'migrate_productos.sql');
import { writeFileSync } from 'fs';
writeFileSync(outPath, sql, 'utf-8');
console.log(`\n✅ SQL migration script written to: ${outPath}`);
console.log('You can import it using: sqlite3 inventario.db < migrate_productos.sql');
console.log('Or via a SQLite browser.');
