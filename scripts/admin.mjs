// Acceso de administración compartido por export.mjs y report.mjs.
// Usa la llave secreta (service role): ejecútalo solo en tu computador, nunca en el navegador ni en un workflow público.
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Define SUPABASE_URL y SUPABASE_SERVICE_KEY (llave service role / secret).');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const PAGE = 1000; // PostgREST devuelve como máximo 1000 filas por consulta

// Lee una vista completa, página por página, en un orden estable.
export async function fetchAll(view) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(view).select('*').order('row_id').range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}
