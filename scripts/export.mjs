// Exporta todos los resultados a export/card_sort.csv y export/tree_test.csv.
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... npm run export
// Las columnas siguen el orden de las vistas: las existentes primero y las nuevas al final.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fetchAll } from './admin.mjs';
import { toCsv } from '../src/csv-export.ts'; // Node >= 22.18 ejecuta .ts directamente

mkdirSync('export', { recursive: true });
for (const [view, file] of [['export_card_sort', 'card_sort.csv'], ['export_tree_test', 'tree_test.csv']]) {
  const rows = await fetchAll(view);
  const columns = rows.length ? Object.keys(rows[0]).filter((c) => c !== 'row_id') : [];
  writeFileSync(`export/${file}`, toCsv(columns, rows));
  console.log(`export/${file}: ${rows.length} filas`);
}
