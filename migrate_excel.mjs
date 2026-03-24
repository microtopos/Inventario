import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the Excel file
const filePath = path.join(__dirname, 'PEDIDO LIMPIEZ DESARROLLO.xlsx');
const workbook = XLSX.readFile(filePath);

console.log('📊 Excel file loaded. Sheets:', workbook.SheetNames);

// We'll iterate through all sheets
workbook.SheetNames.forEach((sheetName, sheetIndex) => {
  const worksheet = workbook.Sheets[sheetName];
  // Convert to JSON with header in first row
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  if (jsonData.length === 0) {
    console.log(`\nSheet "${sheetName}" is empty.`);
    return;
  }

  console.log(`\n=== Sheet "${sheetName}" ===`);
  console.log(`Rows: ${jsonData.length}`);

  // First row should be headers
  const headers = jsonData[0];
  console.log('Headers:', headers);

  // Sample first few data rows
  const sampleRows = 5;
  console.log(`\nFirst ${sampleRows} rows:`);
  for (let i = 1; i < Math.min(sampleRows + 1, jsonData.length); i++) {
    const row = jsonData[i];
    const rowObj = {};
    headers.forEach((header, idx) => {
      rowObj[header] = row[idx];
    });
    console.log(`  Row ${i}:`, rowObj);
  }

  // Collect unique categories (assuming there is a 'Categoría' column or similar)
  // We'll scan the first column for category headers (rows that have a reference blank etc.)
  const categories = new Set();
  const products = [];

  // Heuristic: Category rows typically have a non-empty first cell, and no numeric reference
  // Product rows have a reference number in first column and description
  for (let i = 1; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (!row || row.length === 0) continue;
    const ref = row[0];
    const desc = row[1];

    // If ref is a string and contains only digits? Or is a product code.
    // Category rows might have bold formatting; we can't detect that easily.
    // But we can look at columns: the Excel structure from doc says:
    // Columns: Nº Referencia | Descripción | Cantidad (unidad) | Mes1 | Mes2 | Mes3
    // So reference is likely numeric or alphanumeric code. If row[0] exists and row[1] exists, it's a product line.
    if (ref !== undefined && ref !== '' && desc !== undefined && desc !== '') {
      products.push({
        referencia: ref,
        descripcion: desc,
        // other cells: cat? maybe third column is quantity? Actually third is "Cantidad (unidad de medida)"
        // But categories are not in the product rows; categories are row groups (header rows). So we need to detect those.
      });
    } else if (ref !== undefined && ref !== '' && (desc === undefined || desc === '')) {
      // This could be a category row
      categories.add(String(ref));
    }
  }

  console.log(`\nDetected ${products.length} product rows on this sheet.`);
  console.log('Sample products:', products.slice(0, 5));

  if (categories.size > 0) {
    console.log('Detected categories (possible):');
    categories.forEach(c => console.log(' -', c));
  }
});

console.log('\n✅ Done.');
