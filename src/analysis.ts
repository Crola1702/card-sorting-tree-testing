// Métricas del panel de análisis. Funciones puras y sin imports: scripts/report.mjs les quita los tipos
// y las incrusta en el HTML del panel, donde se recalculan cada vez que cambia el filtro de perfil.
// Las fórmulas y sus bases están explicadas en docs/metricas.md.

export type ParticipantRow = {
  participant_id: string;
  study_id: string;
  role: string;
  years_in_ieee: number;
  member_grade: string;
  officer_experience: boolean;
  wiki_use: string;
  completed?: boolean;
};
export type CardRow = {
  participant_id: string;
  study_id: string;
  group_name: string | null;
  card_id: string;
  card_label: string;
  not_understood?: boolean | null; // ausente o nulo en datos anteriores a la migración: se trata como false
  guess?: string | null;
};
export type TreeRow = {
  participant_id: string;
  study_id: string;
  task_id: string;
  task_text: string;
  correct: boolean | null;
  backtracked: boolean;
  outcome?: string | null; // ausente o nulo en datos anteriores: se deriva de "correct"
  confidence?: number | null;
};
export type ProfileFilter = {
  role?: string;
  member_grade?: string;
  officer_experience?: boolean;
  wiki_use?: string;
  min_years?: number;
  max_years?: number;
};

// Proporción, o null cuando la base es 0 (se muestra como "sin datos", nunca como 0%).
export function ratio(n: number, base: number): number | null {
  return base > 0 ? n / base : null;
}

export function filterParticipants(rows: ParticipantRow[], f: ProfileFilter): ParticipantRow[] {
  return rows.filter((p) =>
    (f.role === undefined || p.role === f.role) &&
    (f.member_grade === undefined || p.member_grade === f.member_grade) &&
    (f.officer_experience === undefined || p.officer_experience === f.officer_experience) &&
    (f.wiki_use === undefined || p.wiki_use === f.wiki_use) &&
    (f.min_years === undefined || p.years_in_ieee >= f.min_years) &&
    (f.max_years === undefined || p.years_in_ieee <= f.max_years));
}

export function outcomeOf(r: TreeRow): string {
  return r.outcome ?? (r.correct ? 'success' : 'failure');
}

// ---------- Card sorting ----------

export type CardStat = {
  card_id: string;
  card_label: string;
  sorters: number; // base: participantes que enviaron el card sort
  not_understood: number;
  pct_not_understood: number | null;
  guesses: string[];
};
export type CardSortAnalysis = {
  started: number;
  sorters: number;
  cards: CardStat[]; // ordenadas de más a menos no entendidas
  matrix: { ids: string[]; labels: string[]; sim: (number | null)[][] };
  excluded: { marks: number; participants: number; cards: string[] };
};

// allowed: ids de los participantes que pasan el filtro (y empezaron este estudio).
export function analyzeCardSort(rows: CardRow[], allowed: Set<string>): CardSortAnalysis {
  const mine = rows.filter((r) => allowed.has(r.participant_id));
  const byParticipant = new Map<string, Map<string, string | null>>(); // tarjeta -> grupo (null = no entendida)
  const labels = new Map<string, string>();
  const stats = new Map<string, CardStat>();
  for (const r of mine) {
    const unknown = r.not_understood === true;
    if (!byParticipant.has(r.participant_id)) byParticipant.set(r.participant_id, new Map());
    byParticipant.get(r.participant_id)!.set(r.card_id, unknown ? null : r.group_name);
    labels.set(r.card_id, r.card_label);
    const s = stats.get(r.card_id) ?? { card_id: r.card_id, card_label: r.card_label, sorters: 0, not_understood: 0, pct_not_understood: null, guesses: [] };
    s.sorters++;
    if (unknown) {
      s.not_understood++;
      if (r.guess) s.guesses.push(r.guess);
    }
    stats.set(r.card_id, s);
  }
  const sorters = byParticipant.size;
  const cards = [...stats.values()]
    .map((s) => ({ ...s, sorters, pct_not_understood: ratio(s.not_understood, sorters) }))
    .sort((a, b) => b.not_understood - a.not_understood || a.card_label.localeCompare(b.card_label));

  // Matriz de similitud solo con tarjetas agrupadas: una tarjeta no entendida no aporta a ningún par.
  const grouped = (id: string) => [...byParticipant.values()].some((m) => m.get(id) != null);
  const ids = [...labels.keys()].filter(grouped).sort((a, b) => labels.get(a)!.localeCompare(labels.get(b)!));
  const sim = ids.map((a) => ids.map((b) => {
    if (a === b) return 1;
    let both = 0;
    let together = 0;
    for (const m of byParticipant.values()) {
      const ga = m.get(a);
      const gb = m.get(b);
      if (ga == null || gb == null) continue;
      both++;
      if (ga === gb) together++;
    }
    return ratio(together, both);
  }));

  return {
    started: allowed.size,
    sorters,
    cards,
    matrix: { ids, labels: ids.map((id) => labels.get(id)!), sim },
    excluded: {
      marks: mine.filter((r) => r.not_understood === true).length,
      participants: new Set(mine.filter((r) => r.not_understood === true).map((r) => r.participant_id)).size,
      cards: [...labels.keys()].filter((id) => !grouped(id)).map((id) => labels.get(id)!),
    },
  };
}

export type Cluster = { ids: string[]; height: number; left?: Cluster; right?: Cluster };

// Agrupamiento jerárquico por enlace promedio, con distancia = 1 - similitud.
// Un par sin datos (nadie agrupó ambas tarjetas) se toma como distancia 1.
export function averageLinkage(ids: string[], sim: (number | null)[][]): Cluster | null {
  if (ids.length === 0) return null;
  const index = new Map(ids.map((id, i) => [id, i]));
  const dist = (a: string, b: string) => 1 - (sim[index.get(a)!][index.get(b)!] ?? 0);
  const linkage = (x: Cluster, y: Cluster) => {
    let total = 0;
    for (const a of x.ids) for (const b of y.ids) total += dist(a, b);
    return total / (x.ids.length * y.ids.length);
  };
  let clusters: Cluster[] = ids.map((id) => ({ ids: [id], height: 0 }));
  while (clusters.length > 1) {
    let best = { i: 0, j: 1, d: Infinity };
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const d = linkage(clusters[i], clusters[j]);
        if (d < best.d) best = { i, j, d };
      }
    }
    const merged = { ids: [...clusters[best.i].ids, ...clusters[best.j].ids], height: best.d, left: clusters[best.i], right: clusters[best.j] };
    clusters = clusters.filter((_, k) => k !== best.i && k !== best.j).concat(merged);
  }
  return clusters[0];
}

// ---------- Tree testing ----------

export type TaskStat = {
  task_id: string;
  task_text: string;
  started: number; // empezaron el estudio (con el filtro aplicado)
  skipped: number;
  abandoned: number; // empezaron pero no llegaron a responder esta tarea
  responded: number; // started - skipped - abandoned
  dont_know: number;
  chose: number; // eligieron un nodo: success + failure
  success: number;
  direct: number; // éxito sin usar "Volver"
  failure: number;
  confidence_n: number;
  confidence_avg: number | null;
  pct: {
    skipped: number | null; // base: started
    abandoned: number | null; // base: started
    dont_know: number | null; // base: responded
    success: number | null; // base: chose
    direct: number | null; // base: chose
    failure: number | null; // base: chose
  };
};

// participants: los de este estudio que pasan el filtro. rows: resultados de este estudio.
export function analyzeTreeTest(participants: ParticipantRow[], rows: TreeRow[]): TaskStat[] {
  const allowed = new Set(participants.map((p) => p.participant_id));
  const mine = rows.filter((r) => allowed.has(r.participant_id));
  const texts = new Map<string, string>();
  for (const r of rows) texts.set(r.task_id, r.task_text); // todas las tareas vistas, aunque el filtro deje 0 filas
  return [...texts.keys()].sort().map((taskId) => {
    const forTask = mine.filter((r) => r.task_id === taskId);
    const count = (o: string) => forTask.filter((r) => outcomeOf(r) === o).length;
    const success = count('success');
    const failure = count('failure');
    const dontKnow = count('dont_know');
    const skipped = count('skipped');
    const direct = forTask.filter((r) => outcomeOf(r) === 'success' && !r.backtracked).length;
    const started = allowed.size;
    const abandoned = Math.max(0, started - forTask.length);
    const responded = started - skipped - abandoned;
    const chose = success + failure;
    const conf = forTask.map((r) => r.confidence).filter((c): c is number => typeof c === 'number');
    return {
      task_id: taskId,
      task_text: texts.get(taskId)!,
      started, skipped, abandoned, responded, dont_know: dontKnow, chose, success, direct, failure,
      confidence_n: conf.length,
      confidence_avg: conf.length ? conf.reduce((a, b) => a + b, 0) / conf.length : null,
      pct: {
        skipped: ratio(skipped, started),
        abandoned: ratio(abandoned, started),
        dont_know: ratio(dontKnow, responded),
        success: ratio(success, chose),
        direct: ratio(direct, chose),
        failure: ratio(failure, chose),
      },
    };
  });
}
