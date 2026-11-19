-- "No sé" en card sorting y tree testing, tareas omitidas, confianza, y guardado progresivo para medir abandono.
-- Compatible hacia atrás: solo agrega columnas con valor por defecto o nulas y relaja restricciones;
-- las filas ya guardadas siguen siendo válidas y se leen como "sin marca de no sé".

-- Card sorting: una tarjeta no entendida se guarda sin grupo, con una suposición opcional.
alter table public.card_sort_placements
  add column not_understood boolean not null default false,
  add column guess text check (guess is null or char_length(btrim(guess)) between 1 and 200),
  alter column group_name drop not null;
alter table public.card_sort_placements add constraint card_sort_placements_marking_check check (
  (not_understood and group_name is null)
  or (not not_understood and group_name is not null and guess is null)
);
-- Un reintento de envío no debe duplicar tarjetas (el cliente trata 23505 como "ya guardado").
alter table public.card_sort_placements add constraint card_sort_placements_participant_card_key
  unique (participant_id, card_id);

-- Tree testing: resultado explícito y confianza opcional. Filas viejas: outcome nulo, se deriva de "correct".
alter table public.tree_test_results
  add column outcome text check (outcome in ('success', 'failure', 'dont_know', 'skipped')),
  add column confidence smallint check (confidence between 1 and 5),
  alter column selected_node_id drop not null,
  alter column selected_label drop not null,
  alter column correct drop not null;
-- "No sé" u "omitida" pueden terminar la tarea sin haber navegado.
alter table public.tree_test_results drop constraint tree_test_results_path_ids_check;
alter table public.tree_test_results add constraint tree_test_results_path_ids_check
  check (cardinality(path_ids) between 0 and 500);
-- Éxito y fallo llevan nodo elegido; "no sé" y "omitida" nunca llevan nodo, ni "correct", ni confianza,
-- así nunca pueden contarse como éxito ni como error.
alter table public.tree_test_results add constraint tree_test_results_outcome_consistency_check check (
  case coalesce(outcome, case when correct then 'success' else 'failure' end)
    when 'success' then correct is true and selected_node_id is not null and selected_label is not null
    when 'failure' then correct is false and selected_node_id is not null and selected_label is not null
    else correct is null and selected_node_id is null and selected_label is null and confidence is null
  end
);
-- Cada tarea se guarda al terminarla; un reintento no debe duplicarla.
alter table public.tree_test_results add constraint tree_test_results_participant_task_key
  unique (participant_id, task_id);

-- Marca de fin de estudio (solo inserción). La Edge Function de insignias la exige,
-- y el análisis la usa para distinguir abandono.
create table public.completions (
  participant_id uuid primary key references public.participants (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.completions enable row level security;
revoke all on public.completions from anon, authenticated;
grant insert on public.completions to anon;
create policy "anon insert only" on public.completions for insert to anon with check (true);

-- Antes de esta migración todo se guardaba al final, así que quien tiene resultados ya había terminado.
insert into public.completions (participant_id)
select p.id from public.participants p
where exists (select 1 from public.card_sort_placements c where c.participant_id = p.id)
   or exists (select 1 from public.tree_test_results t where t.participant_id = p.id);

-- Vistas de exportación: mismas columnas en el mismo orden, y las nuevas al final.
create or replace view public.export_card_sort with (security_invoker = true) as
select
  c.id as row_id,
  p.study_id,
  p.id as participant_id,
  p.role,
  p.years_in_ieee,
  p.member_grade,
  p.officer_experience,
  p.wiki_use,
  c.group_name,
  c.card_id,
  c.card_label,
  c.created_at,
  c.not_understood,
  c.guess
from public.card_sort_placements c
join public.participants p on p.id = c.participant_id;

create or replace view public.export_tree_test with (security_invoker = true) as
select
  t.id as row_id,
  p.study_id,
  p.id as participant_id,
  p.role,
  p.years_in_ieee,
  p.member_grade,
  p.officer_experience,
  p.wiki_use,
  t.task_id,
  t.task_text,
  array_to_string(t.path_labels, ' > ') as path,
  array_to_string(t.path_ids, ' > ') as path_ids,
  t.selected_node_id,
  t.selected_label,
  t.correct,
  t.backtracked,
  t.backtrack_count,
  t.hesitated,
  t.time_to_first_click_ms,
  t.duration_ms,
  t.created_at,
  coalesce(t.outcome, case when t.correct then 'success' else 'failure' end) as outcome,
  t.confidence,
  coalesce(t.outcome, '') = 'skipped' as skipped
from public.tree_test_results t
join public.participants p on p.id = t.participant_id;

-- Participantes con su perfil y si terminaron: base para abandono y para los filtros del panel.
create view public.export_participants with (security_invoker = true) as
select
  p.id as row_id,
  p.study_id,
  p.id as participant_id,
  p.role,
  p.years_in_ieee,
  p.member_grade,
  p.officer_experience,
  p.wiki_use,
  p.created_at,
  exists (select 1 from public.completions c where c.participant_id = p.id) as completed
from public.participants p;

revoke all on public.export_card_sort, public.export_tree_test, public.export_participants from anon, authenticated;
