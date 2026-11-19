-- Profile v2: current role, years in IEEE, membership grade, officer experience and prior wiki use.
-- Drops department (the production table was empty when this was written).
-- Keep the allowed values in sync with ROLES, GRADES and WIKI_USE in src/main.ts.

drop view public.export_card_sort;
drop view public.export_tree_test;

-- "Are you or have you been an IEEE officer?" now covers any officer role, not only Student Branch.
alter table public.participants rename column was_branch_officer to officer_experience;

alter table public.participants
  drop column department,
  add column role text not null check (role in (
    'Sin cargo',
    'Directivo de Rama (presidente, vicepresidente o secretario)',
    'Tesorero de Rama',
    'Directivo de Capítulo o Grupo de Afinidad',
    'Consejero de Rama',
    'Otro'
  )),
  add column member_grade text not null check (member_grade in (
    'Student Member', 'Graduate Student Member', 'Member', 'Otro grado', 'No soy miembro', 'No lo sé'
  )),
  add column wiki_use text not null check (wiki_use in ('Nunca', 'Una o dos veces', 'Varias veces'));

create view public.export_card_sort with (security_invoker = true) as
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
  c.created_at
from public.card_sort_placements c
join public.participants p on p.id = c.participant_id;

create view public.export_tree_test with (security_invoker = true) as
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
  t.created_at
from public.tree_test_results t
join public.participants p on p.id = t.participant_id;

revoke all on public.export_card_sort, public.export_tree_test from anon, authenticated;
