-- The wiki is Colombia-only for now: ask for the Colombian department instead of country or section.
alter table public.participants rename column country_or_section to department;
alter table public.participants drop constraint participants_country_or_section_check;

-- NOT VALID: enforced for new rows, existing pilot/test rows are left untouched (no data is rewritten or deleted).
-- Keep this list in sync with DEPARTMENTS in src/main.ts.
alter table public.participants add constraint participants_department_check check (department in (
  'Amazonas', 'Antioquia', 'Arauca', 'Atlántico', 'Bogotá D.C.', 'Bolívar', 'Boyacá', 'Caldas', 'Caquetá',
  'Casanare', 'Cauca', 'Cesar', 'Chocó', 'Córdoba', 'Cundinamarca', 'Guainía', 'Guaviare', 'Huila',
  'La Guajira', 'Magdalena', 'Meta', 'Nariño', 'Norte de Santander', 'Putumayo', 'Quindío', 'Risaralda',
  'San Andrés y Providencia', 'Santander', 'Sucre', 'Tolima', 'Valle del Cauca', 'Vaupés', 'Vichada',
  'Prefiero no decirlo'
)) not valid;

-- Views keep their original column names after a rename, so recreate them to expose "department".
drop view public.export_card_sort;
drop view public.export_tree_test;

create view public.export_card_sort with (security_invoker = true) as
select
  c.id as row_id,
  p.study_id,
  p.id as participant_id,
  p.department,
  p.years_in_ieee,
  p.was_branch_officer,
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
  p.department,
  p.years_in_ieee,
  p.was_branch_officer,
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
