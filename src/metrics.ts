// Pure calculations behind each stored answer, kept apart from the DOM so they can be unit tested.
import type { Task, TreeNode } from './study.ts';

export type NavStep = { node: TreeNode; back: boolean; at: number };

export type TreeResult = {
  task_id: string;
  task_text: string;
  path_ids: string[];
  path_labels: string[];
  selected_node_id: string;
  selected_label: string;
  correct: boolean;
  backtrack_count: number;
  time_to_first_click_ms: number;
  hesitated: boolean;
  duration_ms: number;
};

// steps: every navigation in order (a "Volver" step carries the parent it returned to).
export function scoreTask(
  task: Task,
  steps: NavStep[],
  selected: TreeNode,
  startedAt: number,
  finishedAt: number,
  hesitationMs: number,
): TreeResult {
  const ms = (t: number) => Math.max(0, Math.round(t - startedAt));
  const ttfc = ms(steps[0]?.at ?? finishedAt);
  return {
    task_id: task.id,
    task_text: task.text,
    path_ids: steps.map((s) => s.node.id),
    path_labels: steps.map((s) => s.node.label),
    selected_node_id: selected.id,
    selected_label: selected.label,
    correct: task.correct.includes(selected.id),
    backtrack_count: steps.filter((s) => s.back).length,
    time_to_first_click_ms: ttfc,
    hesitated: ttfc > hesitationMs,
    duration_ms: ms(finishedAt),
  };
}

export type Placement = { group_name: string; card_id: string; card_label: string };
export type Group = { key: string; name: string; cardIds: string[] };

// Returns the rows to store, or the message to show when the sort is not complete.
export function buildPlacements(pool: string[], groups: Group[], labels: Map<string, string>): Placement[] | string {
  if (pool.length) return `Aún quedan ${pool.length} tarjetas sin agrupar.`;
  const used = groups.filter((g) => g.cardIds.length > 0);
  if (used.some((g) => !g.name.trim())) return 'Ponle nombre a todos los grupos que tienen tarjetas.';
  return used.flatMap((g) => g.cardIds.map((id) => ({ group_name: g.name.trim(), card_id: id, card_label: labels.get(id)! })));
}
