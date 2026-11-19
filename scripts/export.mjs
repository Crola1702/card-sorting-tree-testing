// Exports every result to export/card_sort.csv and export/tree_test.csv.
// Needs the service role (secret) key: run it locally, never in the browser or a public workflow log.
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... npm run export
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { toCsv } from '../src/csv-export.ts'; // Node >= 22.18 runs .ts files directly

const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY (service role / secret key).');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const PAGE = 1000; // PostgREST caps responses at 1000 rows by default

async function fetchAll(view) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(view).select('*').order('row_id').range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

mkdirSync('export', { recursive: true });
for (const [view, file] of [['export_card_sort', 'card_sort.csv'], ['export_tree_test', 'tree_test.csv']]) {
  const rows = await fetchAll(view);
  const columns = rows.length ? Object.keys(rows[0]).filter((c) => c !== 'row_id') : [];
  writeFileSync(`export/${file}`, toCsv(columns, rows));
  console.log(`export/${file}: ${rows.length} rows`);
}
