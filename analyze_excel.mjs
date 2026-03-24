import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, 'PEDIDO LIMPIEZ DESARROLLO.xlsx');
const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

console.log(`📊 Full analysis of sheet: "${sheetName}"`);
console.log(`Total rows: ${data.length}\n`);

const monthNames = ['ENE', 'ENERO', 'FEB', 'FEBRERO', 'MAR', 'MARZO', 'ABR', 'ABRIL', 'MAY', 'JUN', 'JUL', 'AGO', 'SET', 'OCT', 'NOV', 'DIC'];
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

console.log(`Header row index: ${headerRowIndex}`);
console.log(`Header columns:`, headerRow);
console.log('');

const categories = [];
const products = [];
let currentCategory = null;

for (let i = headerRowIndex + 1; i < data.length; i++) {
  const row = data[i];
  if (!row || row.length === 0) continue;

  const ref = row[0];
  const desc = row[1];
  const cant = row[2]; // CANTIDAD column
  const ene = row[3];
  const feb = row[4];
  const mar = row[5];

  const refStr = (ref ?? '').toString().trim();
  const descStr = (desc ?? '').toString().trim();
  const cantStr = (cant ?? '').toString().trim();

  // Category row: reference non-empty and description empty
  if (refStr !== '' && descStr === '') {
    currentCategory = refStr;
    if (!categories.includes(currentCategory)) {
      categories.push(currentCategory);
    }
    continue;
  }

  if (refStr === '') continue;

  // Product row
  products.push({
    referencia: refStr,
    descripcion: descStr,
    cantidad_col: cantStr,
    enero: ene ?? 0,
    febrero: feb ?? 0,
    marzo: mar ?? 0,
    categoria_nombre: currentCategory || 'SIN CATEGORÍA',
  });
}

console.log(`Categories found (${categories.length}):`);
categories.forEach((c, idx) => console.log(`  ${idx + 1}. "${c}"`));
console.log('');

console.log(`Products found: ${products.length}\n`);

// Check for inconsistencies
let issues = [];

products.forEach((p, idx) => {
  // Check if categoria_nombre exists in categories list
  if (!categories.includes(p.categoria_nombre)) {
    issues.push(`Row ${idx + headerRowIndex + 1}: product "${p.referencia}" has category "${p.categoria_nombre}" which is not in the detected categories list.`);
  }

  // Check if quantities in months are numeric > 0
  [p.enero, p.febrero, p.marzo].forEach((val, mIdx) => {
    const num = parseInt(String(val), 10);
    if (String(val).trim() !== '' && isNaN(num)) {
      issues.push(`Row ${idx + headerRowIndex + 1}: month ${mIdx + 1} quantity is non-numeric: "${val}"`);
    }
  });

  // Check if cantidad_col is empty or numeric? It might be the unit of measure or something.
  if (p.cantidad_col === '') {
    // Could be okay, but maybe missing
    // But we ignore
  }
});

if (issues.length > 0) {
  console.log('Issues detected:');
  issues.forEach(msg => console.log(' - ' + msg));
} else {
  console.log('No obvious parsing issues found.');
}

// Show breakdown of quantities per month
const totalEne = products.reduce((sum, p) => sum + (parseInt(String(p.enero), 10) || 0), 0);
const totalFeb = products.reduce((sum, p) => sum + (parseInt(String(p.febrero), 10) || 0), 0);
const totalMar = products.reduce((sum, p) => sum + (parseInt(String(p.marzo), 10) || 0), 0);
console.log(`\nTotal quantities per month:`);
console.log(`  Enero: ${totalEne}`);
console.log(`  Febrero: ${totalFeb}`);
console.log(`  Marzo: ${totalMar}`);

// Check if there are products with zero quantities across all months
const allZero = products.filter(p => {
  const e = parseInt(String(p.enero), 10) || 0;
  const f = parseInt(String(p.febrero), 10) || 0;
  const m = parseInt(String(p.marzo), 10) || 0;
  return e === 0 && f === 0 && m === 0;
});
if (allZero.length > 0) {
  console.log(`\nProducts with zero quantities in all months (${allZero.length}):`);
  allZero.forEach(p => console.log(`  ${p.referencia}: ${p.descripcion}`));
}

console.log('\n✅ Done.');
