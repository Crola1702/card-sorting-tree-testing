import Sortable from 'sortablejs';
import { h, show, shuffle } from './dom.ts';
import { buildPlacements, type Group, type Placement } from './metrics.ts';
import type { CardSortStudy } from './study.ts';

const POOL = 'pool';

// Open card sort: the participant creates and names groups, then drags cards into them.
// Every card also has a "Mover a" select, so the task works without dragging (keyboard, screen readers).
// "No sé qué significa" aparta la tarjeta sin mostrar ninguna definición: una ayuda invalidaría la medición.
export function runCardSort(study: CardSortStudy): Promise<Placement[]> {
  const labels = new Map(study.cards.map((c) => [c.id, c.label]));
  let pool = shuffle(study.cards.map((c) => c.id));
  let groups: Group[] = [];
  const unknown = new Map<string, string>(); // tarjeta no entendida -> "¿Qué crees que significa?" (opcional)
  let nextKey = 1;
  let sortables: Sortable[] = [];

  return new Promise((resolve) => {
    const board = h('div', { className: 'board' });
    const status = h('p', { className: 'error', role: 'alert' });

    const detach = (cardId: string) => {
      pool = pool.filter((id) => id !== cardId);
      for (const g of groups) g.cardIds = g.cardIds.filter((id) => id !== cardId);
    };
    const move = (cardId: string, to: string) => {
      detach(cardId);
      (to === POOL ? pool : groups.find((g) => g.key === to)!.cardIds).push(cardId);
      render();
    };
    const markUnknown = (cardId: string) => {
      detach(cardId);
      unknown.set(cardId, '');
      render();
    };

    // After a drag, the DOM order is the source of truth.
    const syncFromDom = () => {
      const read = (key: string) =>
        [...board.querySelectorAll<HTMLElement>(`[data-list="${key}"] > [data-card]`)].map((el) => el.dataset.card!);
      pool = read(POOL);
      for (const g of groups) g.cardIds = read(g.key);
      render();
    };

    const cardItem = (cardId: string) => {
      const select = h('select', { ariaLabel: `Mover "${labels.get(cardId)}" a`, onchange: () => move(cardId, select.value) },
        h('option', { value: POOL, textContent: 'Sin agrupar' }),
        ...groups.map((g) => h('option', { value: g.key, textContent: g.name.trim() || 'Grupo sin nombre' })),
      );
      select.value = groups.find((g) => g.cardIds.includes(cardId))?.key ?? POOL;
      const dontKnow = h('button', {
        type: 'button',
        className: 'link',
        textContent: 'No sé qué significa',
        ariaLabel: `No sé qué significa "${labels.get(cardId)}"`,
        onclick: () => markUnknown(cardId),
      });
      return h('li', { className: 'card', dataset: { card: cardId } },
        h('span', { textContent: labels.get(cardId)! }),
        h('div', { className: 'card-actions' }, dontKnow, select),
      );
    };

    // Zona aparte, fuera de los grupos y sin arrastre; la marca se puede deshacer antes de enviar.
    const unknownBox = () => h('section', { className: 'group unknown' },
      h('h2', { textContent: `No sé qué significan (${unknown.size})` }),
      unknown.size
        ? h('ul', { className: 'cards' }, ...[...unknown].map(([cardId, guess]) => {
            const input = h('input', {
              value: guess,
              maxLength: 200,
              placeholder: '¿Qué crees que significa? (opcional)',
              ariaLabel: `¿Qué crees que significa "${labels.get(cardId)}"? (opcional)`,
              oninput: () => { unknown.set(cardId, input.value); },
            });
            const undo = h('button', {
              type: 'button',
              className: 'link',
              textContent: 'Deshacer',
              ariaLabel: `Deshacer la marca de "${labels.get(cardId)}"`,
              onclick: () => { unknown.delete(cardId); pool.push(cardId); render(); },
            });
            return h('li', { className: 'card unknown-card' },
              h('span', { textContent: labels.get(cardId)! }), undo, input);
          }))
        : h('p', { className: 'muted', textContent: 'Si no entiendes una tarjeta, toca "No sé qué significa" y aparecerá aquí.' }),
    );

    const list = (key: string, ids: string[]) => h('ul', { className: 'cards', dataset: { list: key } }, ...ids.map(cardItem));

    const groupBox = (g: Group) => {
      const name = h('input', {
        value: g.name,
        placeholder: 'Nombre del grupo',
        maxLength: 100,
        ariaLabel: 'Nombre del grupo',
        // Keep typing smooth: update state without re-rendering, refresh the selects on blur.
        oninput: () => { g.name = name.value; },
        onchange: render,
      });
      const remove = h('button', {
        type: 'button',
        className: 'link',
        textContent: 'Eliminar grupo',
        onclick: () => { pool.push(...g.cardIds); groups = groups.filter((x) => x !== g); render(); },
      });
      return h('section', { className: 'group' }, h('div', { className: 'group-head' }, name, remove), list(g.key, g.cardIds));
    };

    function render() {
      for (const s of sortables) s.destroy();
      board.replaceChildren(
        h('section', { className: 'group pool' }, h('h2', { textContent: `Tarjetas por ordenar (${pool.length})` }), list(POOL, pool)),
        ...groups.map(groupBox),
        unknownBox(),
      );
      status.textContent = '';
      // forceFallback: same pointer-based dragging on desktop and mobile (native HTML5 DnD fails on touch).
      // On touch screens a short hold starts the drag, so normal scrolling still works.
      sortables = [...board.querySelectorAll<HTMLElement>('[data-list]')].map((el) =>
        Sortable.create(el, {
          group: 'cards',
          animation: 150,
          forceFallback: true,
          delay: 200,
          delayOnTouchOnly: true,
          filter: 'select, button',
          preventOnFilter: false,
          onEnd: syncFromDom,
        }),
      );
    }

    const addGroup = h('button', {
      type: 'button',
      textContent: '+ Nuevo grupo',
      onclick: () => {
        groups.push({ key: `g${nextKey++}`, name: '', cardIds: [] });
        render();
        board.querySelector<HTMLInputElement>('.group:last-child input')?.focus();
      },
    });

    const finish = h('button', {
      type: 'button',
      className: 'primary',
      textContent: 'Terminar',
      onclick: () => {
        const result = buildPlacements(pool, groups, labels, unknown);
        if (typeof result === 'string') status.textContent = result;
        else resolve(result);
      },
    });

    render();
    show(
      h('h1', { textContent: study.title }),
      h('p', { textContent: 'Crea grupos, ponles el nombre que te parezca y arrastra cada tarjeta al grupo donde la buscarías. En el celular, mantén presionada la tarjeta para arrastrarla, o usa el menú "Mover a" de cada tarjeta. Si no entiendes una tarjeta, toca "No sé qué significa": es una respuesta válida y útil. No hay respuestas correctas.' }),
      addGroup,
      board,
      status,
      finish,
    );
  });
}
