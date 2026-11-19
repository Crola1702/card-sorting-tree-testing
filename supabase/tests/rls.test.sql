begin;
select plan(14);

set local role anon;

select lives_ok(
  $$insert into public.participants (id, study_id, country_or_section, years_in_ieee, was_branch_officer)
    values ('00000000-0000-0000-0000-000000000001', 'demo', 'Colombia', 2, false)$$,
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
  $$insert into public.participants (id, study_id, country_or_section, years_in_ieee, was_branch_officer)
    values (gen_random_uuid(), 'demo', 'Perú', 200, true)$$,
  '23514', null, 'check constraints reject invalid data');

reset role;
set local role authenticated;
select throws_ok($$select * from public.participants$$, '42501', null, 'authenticated cannot read');
select throws_ok(
  $$insert into public.participants (id, study_id, country_or_section, years_in_ieee, was_branch_officer)
    values (gen_random_uuid(), 'demo', 'Chile', 1, false)$$,
  '42501', null, 'authenticated cannot insert');

reset role;
select is((select count(*) from public.export_tree_test where path = 'Inicio > Becas'), 1::bigint,
  'export view flattens the path');

select * from finish();
rollback;
