// Cálculos puros detrás de cada respuesta guardada, separados del DOM para poder probarlos.
import type { Task, TreeNode } from './study.ts';

export type NavStep = { node: TreeNode; back: boolean; at: number };
export type Outcome = 'success' | 'failure' | 'dont_know' | 'skipped';

export type TreeResult = {
  task_id: string;
  task_text: string;
  path_ids: string[];
  path_labels: string[];
  selected_node_id: string | null;
  selected_label: string | null;
  correct: boolean | null; // null en "no sé" y "omitida": nunca cuentan como éxito ni como error
  outcome: Outcome;
  confidence: number | null; // se agrega después, solo si eligió un nodo
  backtrack_count: number;
  time_to_first_click_ms: number;
  hesitated: boolean;
  duration_ms: number;
};

// steps: cada navegación en orden (un paso "Volver" lleva al padre al que regresó).
// choice: el nodo elegido, o "no sé" / "omitida" (la tarea no aplica a su rol).
export function scoreTask(
  task: Task,
  steps: NavStep[],
  choice: TreeNode | 'dont_know' | 'skipped',
  startedAt: number,
  finishedAt: number,
  hesitationMs: number,
): TreeResult {
  const ms = (t: number) => Math.max(0, Math.round(t - startedAt));
  const ttfc = ms(steps[0]?.at ?? finishedAt);
  const chosen = typeof choice === 'string' ? null : choice;
  const correct = chosen ? task.correct.includes(chosen.id) : null;
  return {
    task_id: task.id,
    task_text: task.text,
    path_ids: steps.map((s) => s.node.id),
    path_labels: steps.map((s) => s.node.label),
    selected_node_id: chosen?.id ?? null,
    selected_label: chosen?.label ?? null,
    correct,
    outcome: chosen ? (correct ? 'success' : 'failure') : (choice as Outcome),
    confidence: null,
    backtrack_count: steps.filter((s) => s.back).length,
    time_to_first_click_ms: ttfc,
    hesitated: ttfc > hesitationMs,
    duration_ms: ms(finishedAt),
  };
}

export type Placement = {
  group_name: string | null;
  card_id: string;
  card_label: string;
  not_understood: boolean;
  guess: string | null;
};
export type Group = { key: string; name: string; cardIds: string[] };

// Devuelve las filas a guardar, o el mensaje a mostrar si el ordenamiento no está completo.
// unknown: tarjetas marcadas "No sé qué significa" -> suposición opcional escrita por el participante.
export function buildPlacements(
  pool: string[],
  groups: Group[],
  labels: Map<string, string>,
  unknown: Map<string, string> = new Map(),
): Placement[] | string {
  if (pool.length) return `Aún quedan ${pool.length} tarjetas sin agrupar.`;
  const used = groups.filter((g) => g.cardIds.length > 0);
  if (used.some((g) => !g.name.trim())) return 'Ponle nombre a todos los grupos que tienen tarjetas.';
  return [
    ...used.flatMap((g) => g.cardIds.map((id) => ({
      group_name: g.name.trim(), card_id: id, card_label: labels.get(id)!, not_understood: false, guess: null,
    }))),
    ...[...unknown].map(([id, guess]) => ({
      group_name: null, card_id: id, card_label: labels.get(id)!, not_understood: true, guess: guess.trim().slice(0, 200) || null,
    })),
  ];
}
