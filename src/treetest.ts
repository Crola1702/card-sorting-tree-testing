import { h, show, shuffle } from './dom.ts';
import { scoreTask, type NavStep, type TreeResult } from './metrics.ts';
import type { Task, TreeNode, TreeTestStudy } from './study.ts';

const ROOT: TreeNode = { id: '(inicio)', label: 'Inicio', children: [] };
const CONFIDENCE = ['Nada seguro', 'Poco seguro', 'Más o menos', 'Bastante seguro', 'Totalmente seguro'];

// Confianza opcional de 1 a 5, solo después de elegir un nodo (en "no sé" u "omitida" no tiene sentido).
function askConfidence(index: number, total: number): Promise<number | null> {
  return new Promise((resolve) => {
    const radios = CONFIDENCE.map((label, i) =>
      h('input', { type: 'radio', name: 'confidence', value: String(i + 1), id: `confidence-${i + 1}` }));
    show(
      h('p', { className: 'muted', textContent: `Tarea ${index + 1} de ${total}` }),
      h('h1', { textContent: '¿Qué tan seguro estás de tu respuesta?' }),
      h('form', {
        onsubmit: (e: SubmitEvent) => {
          e.preventDefault();
          const picked = radios.find((r) => r.checked);
          resolve(picked ? Number(picked.value) : null);
        },
      },
        h('fieldset', { className: 'scale' },
          h('legend', { textContent: 'Opcional. 1 = nada seguro, 5 = totalmente seguro.' }),
          ...radios.map((r, i) => h('label', { className: 'inline' }, r, ` ${i + 1}. ${CONFIDENCE[i]}`)),
        ),
        h('button', { className: 'primary', textContent: 'Siguiente' }),
      ),
    );
  });
}

// Drill-down navigation: one level at a time, which fits small screens.
function runTask(study: TreeTestStudy, task: Task, index: number, total: number): Promise<TreeResult> {
  const stack: TreeNode[] = [{ ...ROOT, children: study.tree }];
  const steps: NavStep[] = [];
  const startedAt = performance.now();

  return new Promise((resolve) => {
    const finish = async (choice: TreeNode | 'dont_know' | 'skipped') => {
      const result = scoreTask(task, steps, choice, startedAt, performance.now(), study.hesitationMs);
      if (typeof choice !== 'string') result.confidence = await askConfidence(index, total);
      resolve(result);
    };
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
        onclick: () => finish(current),
      });
      // Siempre visibles: abstenerse es una respuesta válida y no cuenta como éxito ni como error.
      const dontKnow = h('button', { type: 'button', textContent: 'No sé dónde buscaría esto', onclick: () => finish('dont_know') });
      const skip = h('button', { type: 'button', className: 'link', textContent: 'Esta tarea no aplica a mi rol', onclick: () => finish('skipped') });

      show(
        h('p', { className: 'muted', textContent: `Tarea ${index + 1} de ${total}` }),
        h('h1', { className: 'task', textContent: task.text }),
        h('nav', { ariaLabel: 'Ubicación actual', className: 'crumbs' }, stack.map((n) => n.label).join(' › ')),
        current.children.length
          ? h('ul', { className: 'tree' }, ...current.children.map((child) =>
              h('li', {}, h('button', { type: 'button', textContent: child.label, onclick: () => { stack.push(child); visit(child, false); } }))))
          : h('p', { className: 'muted', textContent: 'No hay más opciones dentro de esta sección.' }),
        h('div', { className: 'actions' }, ...(stack.length === 1 ? [] : [back, choose])),
        h('div', { className: 'actions abstain' }, dontKnow, skip),
      );
    }

    render();
  });
}

// Cada tarea se entrega a onResult apenas termina, para guardarla y poder medir abandono.
export async function runTreeTest(study: TreeTestStudy, onResult: (result: TreeResult) => Promise<void>): Promise<void> {
  const tasks = shuffle(study.tasks);
  for (const [i, task] of tasks.entries()) await onResult(await runTask(study, task, i, tasks.length));
}
