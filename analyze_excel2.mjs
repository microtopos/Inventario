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

const monthNames = ['ENE', 'ENERO', 'FEB', 'FEBRERO', 'MAR', 'MARZO'];
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

const products = [];
let currentCategory = null;

for (let i = headerRowIndex + 1; i < data.length; i++) {
  const row = data[i];
  if (!row || row.length === 0) continue;

  const ref = row[0];
  const desc = row[1];
  const cant = row[2]; // CANTIDAD
  const ene = row[3];
  const feb = row[4];
  const mar = row[5];

  const refStr = (ref ?? '').toString().trim();
  const descStr = (desc ?? '').toString().trim();
  const cantStr = (cant ?? '').toString().trim();

  if (refStr !== '' && descStr === '') {
    currentCategory = refStr;
    continue;
  }

  if (refStr === '') continue;

  products.push({
    referencia: refStr,
    descripcion: descStr,
    cantidad_col: cantStr,
    enero: ene,
    febrero: feb,
    marzo: mar,
    categoria_nombre: currentCategory,
  });
}

// Print table header
console.log('REFERENCIA | DESCRIPCION | CANTIDAD | ENERO | FEBRERO | MARZO | CATEGORIA');
console.log('-----------|-------------|----------|-------|---------|-------|----------');

// Print each product row (all 50)
products.forEach(p => {
  const ref = p.referencia.padEnd(12);
  const desc = p.descripcion.substring(0, 25).padEnd(25);
  const cant = p.cantidad_col.padEnd(8);
  const ene = String(p.enero ?? '').padEnd(5);
  const feb = String(p.febrero ?? '').padEnd(7);
  const mar = String(p.marzo ?? '').padEnd(5);
  const cat = p.categoria_nombre;
  console.log(`${ref} | ${desc} | ${cant} | ${ene} | ${feb} | ${mar} | ${cat}`);
});

console.log('\n--- End of data ---');
