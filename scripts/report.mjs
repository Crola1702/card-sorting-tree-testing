// Genera el panel de análisis export/report.html: un solo archivo con los datos y los filtros por perfil.
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... npm run report
// Las métricas vienen de src/analysis.ts (las mismas funciones que prueban los tests), sin dependencias nuevas.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { fetchAll } from './admin.mjs';

const [participants, cards, tree] = await Promise.all(
  ['export_participants', 'export_card_sort', 'export_tree_test'].map(fetchAll),
);

// "<" escapado: ningún texto de un participante puede cerrar la etiqueta <script> del panel.
const data = JSON.stringify({ generated_at: new Date().toISOString(), participants, cards, tree }).replace(/</g, '\\u003c');
const analysis = stripTypeScriptTypes(readFileSync(new URL('../src/analysis.ts', import.meta.url), 'utf8'));
const html = readFileSync(new URL('./report-template.html', import.meta.url), 'utf8')
  .replace('/*__ANALYSIS__*/', () => analysis)
  .replace('/*__DATA__*/null', () => data);

mkdirSync('export', { recursive: true });
writeFileSync('export/report.html', html);
console.log(`export/report.html: ${participants.length} participantes, ${cards.length} filas de tarjetas, ${tree.length} filas de tareas`);
