begin;
select plan(27);

set local role anon;

select lives_ok(
  $$insert into public.participants (id, study_id, role, years_in_ieee, member_grade, officer_experience, wiki_use)
    values ('00000000-0000-0000-0000-000000000001', 'demo', 'Directivo de Rama (presidente, vicepresidente, secretario o tesorero)', 2, 'Student Member', true, 'Nunca')$$,
  'anon can insert a participant');

select lives_ok(
  $$insert into public.card_sort_placements (participant_id, study_id, group_name, card_id, card_label)
    values ('00000000-0000-0000-0000-000000000001', 'demo', 'Eventos', 'c1', 'Congresos')$$,
  'anon can insert a card placement');

select lives_ok(
  $$insert into public.tree_test_results (participant_id, study_id, task_id, task_text, path_ids, path_labels,
      selected_node_id, selected_label, correct, backtrack_count, time_to_first_click_ms, hesitated, duration_ms)
    values ('00000000-0000-0000-0000-000000000001', 'demo', 't1', 'Busca becas', '{n1,n2}', '{Inicio,Becas}',
      'n2', 'Becas', true, 0, 1200, false, 5000)$$,
  'anon can insert a tree test result');

select throws_ok($$select * from public.participants$$, '42501', null, 'anon cannot read participants');
select throws_ok($$select * from public.card_sort_placements$$, '42501', null, 'anon cannot read placements');
select throws_ok($$select * from public.tree_test_results$$, '42501', null, 'anon cannot read tree results');
select throws_ok($$select * from public.export_card_sort$$, '42501', null, 'anon cannot read card export');
select throws_ok($$select * from public.export_tree_test$$, '42501', null, 'anon cannot read tree export');
select throws_ok($$update public.participants set years_in_ieee = 9$$, '42501', null, 'anon cannot update');
select throws_ok($$delete from public.participants$$, '42501', null, 'anon cannot delete');
select throws_ok(
  $$insert into public.participants (id, study_id, role, years_in_ieee, member_grade, officer_experience, wiki_use)
    values (gen_random_uuid(), 'demo', 'Ninguno', 200, 'Member', false, 'Nunca')$$,
  '23514', null, 'check constraints reject invalid data');
select throws_ok(
  $$insert into public.participants (id, study_id, role, years_in_ieee, member_grade, officer_experience, wiki_use)
    values (gen_random_uuid(), 'demo', 'Presidente del universo', 1, 'Member', true, 'Nunca')$$,
  '23514', null, 'only listed roles are accepted');

select lives_ok($$select public.ping()$$, 'anon can call the keepalive ping');

-- Campos nuevos: "no sé", omitida, confianza y marca de fin (migración 20261119050000).
select lives_ok(
  $$insert into public.card_sort_placements (participant_id, study_id, group_name, card_id, card_label, not_understood, guess)
    values ('00000000-0000-0000-0000-000000000001', 'demo', null, 'c2', 'Rebate', true, 'algo de dinero')$$,
  'anon can insert a card marked as not understood, with a guess');
select lives_ok(
  $$insert into public.tree_test_results (participant_id, study_id, task_id, task_text, path_ids, path_labels,
      backtrack_count, time_to_first_click_ms, hesitated, duration_ms, outcome)
    values ('00000000-0000-0000-0000-000000000001', 'demo', 't2', 'x', '{}', '{}', 0, 900, false, 900, 'dont_know')$$,
  'anon can insert a "no sé" task without node, path or correct flag');
select lives_ok(
  $$insert into public.tree_test_results (participant_id, study_id, task_id, task_text, path_ids, path_labels,
      backtrack_count, time_to_first_click_ms, hesitated, duration_ms, outcome)
    values ('00000000-0000-0000-0000-000000000001', 'demo', 't3', 'x', '{}', '{}', 0, 500, false, 500, 'skipped')$$,
  'anon can insert a skipped task');
select lives_ok($$insert into public.completions (participant_id) values ('00000000-0000-0000-0000-000000000001')$$, 'anon can insert the completion mark');
select throws_ok(
  $$insert into public.tree_test_results (participant_id, study_id, task_id, task_text, path_ids, path_labels,
      correct, backtrack_count, time_to_first_click_ms, hesitated, duration_ms, outcome)
    values ('00000000-0000-0000-0000-000000000001', 'demo', 't4', 'x', '{}', '{}', true, 0, 1, false, 1, 'dont_know')$$,
  '23514', null, '"no sé" can never be stored as correct');
select throws_ok(
  $$insert into public.card_sort_placements (participant_id, study_id, group_name, card_id, card_label, not_understood)
    values ('00000000-0000-0000-0000-000000000001', 'demo', 'G', 'c3', 'X', true)$$,
  '23514', null, 'a not-understood card cannot also be in a group');
select throws_ok(
  $$insert into public.tree_test_results (participant_id, study_id, task_id, task_text, path_ids, path_labels,
      backtrack_count, time_to_first_click_ms, hesitated, duration_ms, outcome)
    values ('00000000-0000-0000-0000-000000000001', 'demo', 't2', 'x', '{}', '{}', 0, 1, false, 1, 'skipped')$$,
  '23505', null, 'the same task cannot be saved twice for a participant');
select throws_ok($$select not_understood, guess from public.card_sort_placements$$, '42501', null, 'anon cannot read the new card columns');
select throws_ok($$select outcome, confidence from public.tree_test_results$$, '42501', null, 'anon cannot read the new task columns');
select throws_ok($$select * from public.completions$$, '42501', null, 'anon cannot read completions');
select throws_ok($$select * from public.export_participants$$, '42501', null, 'anon cannot read the participants export');

reset role;
set local role authenticated;
select throws_ok($$select * from public.participants$$, '42501', null, 'authenticated cannot read');
select throws_ok(
  $$insert into public.participants (id, study_id, role, years_in_ieee, member_grade, officer_experience, wiki_use)
    values (gen_random_uuid(), 'demo', 'Ninguno', 1, 'Member', false, 'Nunca')$$,
  '42501', null, 'authenticated cannot insert');

reset role;
select is((select count(*) from public.export_tree_test where path = 'Inicio > Becas'), 1::bigint,
  'export view flattens the path');

select * from finish();
rollback;
