// Loads and validates study definitions from public/studies/<id>.json or <id>.csv.
// Error messages are shown to the organizer in the UI, so they are in Spanish.

export type Card = { id: string; label: string };
export type TreeNode = { id: string; label: string; children: TreeNode[] };
export type Task = { id: string; text: string; correct: string[] };
type Common = { id: string; title: string; intro: string; consent: string };
export type CardSortStudy = Common & { kind: 'card_sort'; cards: Card[] };
export type TreeTestStudy = Common & {
  kind: 'tree_test';
  tree: TreeNode[];
  tasks: Task[];
  hesitationMs: number;
};
export type Study = CardSortStudy | TreeTestStudy;
// One shared link that sends each participant to one of several studies at random (A/B test).
export type SplitStudy = { id: string; kind: 'split'; variants: string[] };

const DEFAULT_HESITATION_MS = 10_000;
export const STUDY_ID = /^[A-Za-z0-9_-]{1,64}$/;
// Must stay true to what the app stores; update it if the profile form or tables change.
export const DEFAULT_CONSENT = [
  'Este estudio busca mejorar cómo se organiza la información para estudiantes de IEEE. Participar es voluntario.',
  'Qué guardamos: tu departamento, tus años en IEEE, si has sido directivo de rama y tus respuestas a la actividad. No pedimos tu nombre, correo ni otros datos de contacto, y no vinculamos tus respuestas con tu identidad.',
  'Nada se guarda hasta que termines. Puedes salir en cualquier momento cerrando esta página.',
  'Si al final se ofrece una insignia digital, reclamarla es opcional y se hace en otra página, que pedirá tu nombre y correo por separado. Esa página no recibe tus respuestas.',
  'Los resultados se analizan en conjunto y solo los ve el equipo organizador. Si tienes preguntas, escribe a quien te compartió el enlace.',
].join('\n');
// Must match the CHECK constraints in the migration, or answers would be rejected at submit time.
const MAX_ID = 100;
const MAX_LABEL = 300;
const MAX_TASK = 1000;

function fail(message: string): never {
  throw new Error(message);
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' && typeof value !== 'number') fail(`Falta el campo "${field}".`);
  const s = String(value).trim();
  if (!s) fail(`El campo "${field}" está vacío.`);
  if (s.length > max) fail(`El campo "${field}" supera ${max} caracteres: "${s.slice(0, 40)}…"`);
  return s;
}

function list(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0) fail(`"${field}" debe ser una lista con al menos un elemento.`);
  return value;
}

function unique(ids: string[], what: string) {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) fail(`El id "${id}" está repetido en ${what}.`);
    seen.add(id);
  }
}

export function parseStudyJson(id: string, raw: any): Study | SplitStudy {
  if (!raw || typeof raw !== 'object') fail('El archivo no contiene un objeto JSON.');
  if (raw.kind === 'split') {
    const variants = list(raw.variants, 'variants').map((v) => text(v, 'variants', 64));
    if (variants.length < 2) fail('"variants" necesita al menos dos estudios.');
    for (const v of variants) {
      if (!STUDY_ID.test(v)) fail(`"${v}" no es un id de estudio válido.`);
      if (v === id) fail('Un estudio "split" no puede apuntarse a sí mismo.');
    }
    unique(variants, 'variants');
    return { id, kind: 'split', variants };
  }
  const title = text(raw.title, 'title', MAX_LABEL);
  const intro = typeof raw.intro === 'string' ? raw.intro.trim() : '';
  const consent = typeof raw.consent === 'string' && raw.consent.trim() ? raw.consent.trim() : DEFAULT_CONSENT;
  const common = { id, title, intro, consent };

  if (raw.kind === 'card_sort') {
    const cards = list(raw.cards, 'cards').map((c: any) => ({
      id: text(c?.id, 'cards.id', MAX_ID),
      label: text(c?.label, 'cards.label', MAX_LABEL),
    }));
    unique(cards.map((c) => c.id), 'las tarjetas');
    return { ...common, kind: 'card_sort', cards };
  }

  if (raw.kind === 'tree_test') {
    const nodeIds: string[] = [];
    const toNode = (n: any): TreeNode => {
      const node = { id: text(n?.id, 'tree.id', MAX_ID), label: text(n?.label, 'tree.label', MAX_LABEL), children: [] as TreeNode[] };
      nodeIds.push(node.id);
      if (n.children !== undefined) node.children = list(n.children, `children de "${node.id}"`).map(toNode);
      return node;
    };
    const tree = list(raw.tree, 'tree').map(toNode);
    unique(nodeIds, 'el árbol');

    const known = new Set(nodeIds);
    const tasks = list(raw.tasks, 'tasks').map((t: any) => {
      const task = {
        id: text(t?.id, 'tasks.id', MAX_ID),
        text: text(t?.text, 'tasks.text', MAX_TASK),
        correct: list(t?.correct, 'tasks.correct').map((c) => text(c, 'tasks.correct', MAX_ID)),
      };
      for (const c of task.correct) if (!known.has(c)) fail(`La tarea "${task.id}" apunta a "${c}", que no existe en el árbol.`);
      return task;
    });
    unique(tasks.map((t) => t.id), 'las tareas');

    const hesitationMs = raw.hesitation_ms === undefined ? DEFAULT_HESITATION_MS : Number(raw.hesitation_ms);
    if (!(hesitationMs > 0)) fail('"hesitation_ms" debe ser un número mayor que 0.');
    return { ...common, kind: 'tree_test', tree, tasks, hesitationMs };
  }

  fail('"kind" debe ser "card_sort", "tree_test" o "split".');
}

// RFC 4180 parser. Accepts ";" as separator because Excel uses it in Spanish locales.
export function parseCsv(input: string): string[][] {
  const source = input.replace(/^﻿/, '');
  const header = source.split(/\r?\n/, 1)[0];
  const sep = header.includes(';') && !header.includes(',') ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (source[i + 1] === '"') { field += '"'; i++; }
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && source[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim()));
}

// CSV columns: type,id,parent,text,correct. Types: title, intro, consent, hesitation_ms, card, node, task.
export function parseStudyCsv(id: string, input: string): Study {
  const [header, ...rows] = parseCsv(input);
  if (!header) fail('El CSV está vacío.');
  const cols = header.map((h) => h.trim().toLowerCase());
  for (const required of ['type', 'text']) if (!cols.includes(required)) fail(`Al CSV le falta la columna "${required}".`);
  const get = (r: string[], col: string) => (r[cols.indexOf(col)] ?? '').trim();

  const raw: any = { cards: [], tree: [], tasks: [] };
  const nodes = new Map<string, any>();
  const parents: [any, string][] = [];
  rows.forEach((r, i) => {
    const type = get(r, 'type').toLowerCase();
    if (type === 'title' || type === 'intro' || type === 'consent' || type === 'hesitation_ms') raw[type] = get(r, 'text');
    else if (type === 'card') raw.cards.push({ id: get(r, 'id'), label: get(r, 'text') });
    else if (type === 'task') raw.tasks.push({ id: get(r, 'id'), text: get(r, 'text'), correct: get(r, 'correct').split('|').map((c) => c.trim()).filter(Boolean) });
    else if (type === 'node') {
      const node = { id: get(r, 'id'), label: get(r, 'text'), children: [] as any[] };
      if (nodes.has(node.id)) fail(`El id "${node.id}" está repetido en el árbol.`);
      nodes.set(node.id, node);
      parents.push([node, get(r, 'parent')]);
    } else fail(`Fila ${i + 2}: tipo desconocido "${type}".`);
  });

  for (const [node, parent] of parents) {
    if (!parent) raw.tree.push(node);
    else if (!nodes.has(parent)) fail(`El nodo "${node.id}" tiene un padre inexistente: "${parent}".`);
    else nodes.get(parent).children.push(node);
  }
  // Nodes caught in a parent cycle are never reachable from a root.
  const count = (ns: any[]): number => ns.reduce((n, x) => n + 1 + count(x.children), 0);
  if (count(raw.tree) !== nodes.size) fail('El árbol tiene un ciclo entre padres.');
  for (const node of nodes.values()) if (node.children.length === 0) delete node.children;

  if (raw.cards.length && nodes.size) fail('El CSV mezcla tarjetas (card) y árbol (node). Usa un archivo por estudio.');
  raw.kind = raw.cards.length ? 'card_sort' : nodes.size ? 'tree_test' : fail('El CSV no tiene filas "card" ni "node".');
  return parseStudyJson(id, raw) as Study; // kind is card_sort or tree_test, set just above
}

async function fetchStudy(id: string): Promise<Study | SplitStudy> {
  for (const ext of ['json', 'csv'] as const) {
    const res = await fetch(`studies/${id}.${ext}`, { cache: 'no-cache' });
    // The Vite dev server answers missing files with index.html, so check the content type too.
    if (!res.ok || res.headers.get('content-type')?.includes('html')) continue;
    const body = await res.text();
    if (ext === 'csv') return parseStudyCsv(id, body);
    try {
      return parseStudyJson(id, JSON.parse(body));
    } catch (e) {
      throw e instanceof SyntaxError ? new Error(`JSON inválido: ${e.message}`) : e;
    }
  }
  fail(`No existe el estudio "${id}".`);
}

// Sticky per browser, so reloading never shows a participant the other variant.
export function pickVariant(split: SplitStudy, random = Math.random): string {
  const key = `variant:${split.id}`;
  try {
    const saved = localStorage.getItem(key);
    if (saved && split.variants.includes(saved)) return saved;
  } catch { /* storage blocked: fall back to a fresh draw */ }
  const variant = split.variants[Math.min(split.variants.length - 1, Math.floor(random() * split.variants.length))];
  try { localStorage.setItem(key, variant); } catch { /* ignore */ }
  return variant;
}

export async function loadStudy(id: string): Promise<Study> {
  const study = await fetchStudy(id);
  if (study.kind !== 'split') return study;
  const variant = await fetchStudy(pickVariant(study));
  if (variant.kind === 'split') fail('Un estudio "split" no puede apuntar a otro "split".');
  return variant;
}
