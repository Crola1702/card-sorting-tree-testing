// Self-hosted font (same as the wiki) so participants' browsers never contact Google Fonts.
import '@fontsource/ibm-plex-sans/300.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/700.css';
import './style.css';
import { createClient } from '@supabase/supabase-js';
import { h, show } from './dom.ts';
import { loadStudy, type Study } from './study.ts';
import { runCardSort } from './cardsort.ts';
import { runTreeTest } from './treetest.ts';

// Only the public anon key ever reaches the browser; RLS lets it INSERT and nothing else.
const db = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

type Profile = { role: string; years_in_ieee: number; member_grade: string; officer_experience: boolean; wiki_use: string };

// Must match the CHECK constraints in supabase/migrations/20261119030000_profile_v2.sql (roles: 20261119040000_roles_v2.sql).
const ROLES = [
  'Directivo de Rama (presidente, vicepresidente, secretario o tesorero)',
  'Directivo de Capítulo o Grupo de Afinidad',
  'Consejero de Rama',
  'Voluntario',
  'Ninguno',
];
const GRADES = ['Student Member', 'Graduate Student Member', 'Member', 'Otro grado', 'No soy miembro', 'No lo sé'];
const WIKI_USE = ['Nunca', 'Una o dos veces', 'Varias veces'];

const choice = (id: string, placeholder: string, options: string[]) =>
  h('select', { id, required: true },
    h('option', { value: '', textContent: placeholder }),
    ...options.map((o) => h('option', { value: o, textContent: o })),
  );

function message(title: string, body: string) {
  show(h('h1', { textContent: title }), h('p', { textContent: body }));
}

const paragraphs = (text: string) => text.split(/\n+/).map((p) => h('p', { textContent: p }));

// Nothing is stored before this checkbox is accepted and the activity is finished.
function intro(study: Study): Promise<void> {
  return new Promise((resolve) => {
    const agree = h('input', { type: 'checkbox', id: 'consent', required: true });
    show(
      h('h1', { textContent: study.title }),
      ...paragraphs(study.intro),
      h('form', { onsubmit: (e: SubmitEvent) => { e.preventDefault(); resolve(); } },
        h('section', { className: 'consent' },
          h('h2', { textContent: 'Consentimiento informado' }),
          ...paragraphs(study.consent),
        ),
        h('label', { className: 'inline' }, agree, ' He leído la información anterior y acepto participar.'),
        h('button', { className: 'primary', textContent: 'Comenzar' }),
      ),
    );
  });
}

function profileForm(): Promise<Profile> {
  return new Promise((resolve) => {
    const role = choice('role', 'Elige tu cargo', ROLES);
    const years = h('input', { id: 'years', type: 'number', inputMode: 'numeric', min: '0', max: '70', step: '1', required: true });
    const grade = choice('grade', 'Elige tu grado', GRADES);
    const officerYes = h('input', { type: 'radio', name: 'officer', value: 'yes', id: 'officer-yes', required: true });
    const officerNo = h('input', { type: 'radio', name: 'officer', value: 'no', id: 'officer-no' });
    const wikiUse = WIKI_USE.map((value, i) =>
      h('input', { type: 'radio', name: 'wiki-use', value, id: `wiki-use-${i}`, required: true }));
    show(
      h('h1', { textContent: 'Antes de empezar' }),
      h('form', {
        onsubmit: (e: SubmitEvent) => {
          e.preventDefault();
          resolve({
            role: role.value,
            years_in_ieee: Number(years.value),
            member_grade: grade.value,
            officer_experience: officerYes.checked,
            wiki_use: wikiUse.find((r) => r.checked)!.value,
          });
        },
      },
        h('label', { htmlFor: 'role', textContent: 'Tu cargo actual principal en IEEE' }), role,
        h('label', { htmlFor: 'years', textContent: 'Años en IEEE' }), years,
        h('label', { htmlFor: 'grade', textContent: 'Grado de membresía IEEE' }), grade,
        h('fieldset', {},
          h('legend', { textContent: '¿Eres o has sido directivo en IEEE (Rama, Capítulo o Grupo de Afinidad)?' }),
          h('label', { className: 'inline' }, officerYes, ' Sí'),
          h('label', { className: 'inline' }, officerNo, ' No'),
        ),
        h('fieldset', {},
          h('legend', { textContent: '¿Habías usado antes la wiki de Ramas Estudiantiles IEEE Colombia?' }),
          ...wikiUse.map((r, i) => h('label', { className: 'inline' }, r, ` ${WIKI_USE[i]}`)),
        ),
        h('button', { className: 'primary', textContent: 'Continuar' }),
      ),
    );
  });
}

// Optional badge: the Edge Function checks completion in the DB and returns a signed claim link.
// Any failure (not configured, offline) just hides the button.
async function claimUrl(participant_id: string): Promise<string | undefined> {
  try {
    const { data, error } = await db.functions.invoke('completion-token', { body: { participant_id } });
    if (error) throw error;
    return typeof data?.claim_url === 'string' && data.claim_url.startsWith('https://') ? data.claim_url : undefined;
  } catch (e) {
    console.warn('Badge unavailable', e);
    return undefined;
  }
}

function thanks(claim?: string) {
  show(
    h('h1', { textContent: '¡Gracias por participar!' }),
    h('p', { textContent: 'Tus respuestas quedaron guardadas.' }),
    ...(claim
      ? [
          h('section', { className: 'consent' },
            h('h2', { textContent: 'Insignia digital (opcional)' }),
            h('p', { textContent: 'Puedes reclamar una insignia por participar. Se abrirá la página de insignias de IEEE, donde te pedirán tu nombre y correo para emitirla. Tus respuestas de este estudio no se envían a esa página. El enlace vence en 30 días.' }),
            h('a', { className: 'button primary', href: claim, target: '_blank', rel: 'noopener noreferrer', textContent: 'Reclamar mi insignia' }),
          ),
        ]
      : []),
    h('p', { className: 'muted', textContent: 'Ya puedes cerrar esta página.' }),
  );
}

// Inserts the participant, then all results in a single statement. On retry, a duplicate
// participant (23505) means the first insert already succeeded, so it is not an error.
async function submit(study: Study, profile: Profile, table: string, rows: object[]) {
  const participant_id = crypto.randomUUID();
  const save = async () => {
    const p = await db.from('participants').insert({ id: participant_id, study_id: study.id, ...profile });
    if (p.error && p.error.code !== '23505') throw p.error;
    const r = await db.from(table).insert(rows.map((row) => ({ ...row, participant_id, study_id: study.id })));
    if (r.error) throw r.error;
  };
  for (;;) {
    message('Guardando tus respuestas…', 'No cierres esta página.');
    try {
      await save();
      return thanks(await claimUrl(participant_id));
    } catch (e) {
      console.error(e);
      await new Promise<void>((retry) =>
        show(
          h('h1', { textContent: 'No pudimos guardar tus respuestas' }),
          h('p', { textContent: 'Revisa tu conexión a internet y vuelve a intentarlo. Tus respuestas siguen en esta página.' }),
          h('button', { type: 'button', className: 'primary', textContent: 'Reintentar', onclick: () => retry() }),
        ),
      );
    }
  }
}

async function main() {
  const id = location.hash.match(/^#\/s\/([A-Za-z0-9_-]{1,64})$/)?.[1];
  if (!id) return message('Enlace no válido', 'Revisa el enlace del estudio que te compartieron.');
  let study: Study;
  try {
    study = await loadStudy(id);
  } catch (e) {
    return message('No se pudo cargar el estudio', (e as Error).message);
  }
  document.title = study.title;
  await intro(study);
  const profile = await profileForm();
  if (study.kind === 'card_sort') await submit(study, profile, 'card_sort_placements', await runCardSort(study));
  else await submit(study, profile, 'tree_test_results', await runTreeTest(study));
}

window.addEventListener('hashchange', () => location.reload());
main();
