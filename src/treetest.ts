import { h, show, shuffle } from './dom.ts';
import { scoreTask, type NavStep, type TreeResult } from './metrics.ts';
import type { Task, TreeNode, TreeTestStudy } from './study.ts';

const ROOT: TreeNode = { id: '(inicio)', label: 'Inicio', children: [] };

// Drill-down navigation: one level at a time, which fits small screens.
function runTask(study: TreeTestStudy, task: Task, index: number, total: number): Promise<TreeResult> {
  const stack: TreeNode[] = [{ ...ROOT, children: study.tree }];
  const steps: NavStep[] = [];
  const startedAt = performance.now();

  return new Promise((resolve) => {
    const visit = (node: TreeNode, back: boolean) => {
      steps.push({ node, back, at: performance.now() });
      render();
    };

    function render() {
      const current = stack.at(-1)!;
      const back = h('button', {
        type: 'button',
        textContent: '← Volver',
        onclick: () => { stack.pop(); visit(stack.at(-1)!, true); },
      });
      const choose = h('button', {
        type: 'button',
        className: 'primary',
        textContent: 'Aquí lo encontraría',
        onclick: () => resolve(scoreTask(task, steps, current, startedAt, performance.now(), study.hesitationMs)),
      });

      show(
        h('p', { className: 'muted', textContent: `Tarea ${index + 1} de ${total}` }),
        h('h1', { className: 'task', textContent: task.text }),
        h('nav', { ariaLabel: 'Ubicación actual', className: 'crumbs' }, stack.map((n) => n.label).join(' › ')),
        current.children.length
          ? h('ul', { className: 'tree' }, ...current.children.map((child) =>
              h('li', {}, h('button', { type: 'button', textContent: child.label, onclick: () => { stack.push(child); visit(child, false); } }))))
          : h('p', { className: 'muted', textContent: 'No hay más opciones dentro de esta sección.' }),
        h('div', { className: 'actions' }, ...(stack.length === 1 ? [] : [back, choose])),
      );
    }

    render();
  });
}

export async function runTreeTest(study: TreeTestStudy): Promise<TreeResult[]> {
  const tasks = shuffle(study.tasks);
  const results: TreeResult[] = [];
  for (const [i, task] of tasks.entries()) results.push(await runTask(study, task, i, tasks.length));
  return results;
}
