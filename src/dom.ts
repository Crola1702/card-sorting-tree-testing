type Props<K extends keyof HTMLElementTagNameMap> = Partial<Omit<HTMLElementTagNameMap[K], 'style'>> & { dataset?: Record<string, string> };

// Builds elements with properties (never innerHTML), so study texts cannot inject markup.
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props<K> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const { dataset, ...rest } = props;
  const el = Object.assign(document.createElement(tag), rest);
  if (dataset) Object.assign(el.dataset, dataset);
  el.append(...children);
  return el;
}

const app = document.getElementById('app')!;

// Replaces the screen and moves focus to its heading so screen readers announce the change.
export function show(...children: Node[]) {
  app.replaceChildren(...children);
  const heading = app.querySelector<HTMLElement>('h1, h2');
  if (heading) {
    heading.tabIndex = -1;
    heading.focus();
  }
  window.scrollTo(0, 0);
}

export function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
