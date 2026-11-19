// Attacks the running API with the public key(s), exactly as anyone visiting the site could.
// Needs a local stack: npx supabase start, then API_URL and ANON_KEY / PUBLISHABLE_KEY from `npx supabase status -o env`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const url = process.env.API_URL;
const keys = Object.entries({ anon: process.env.ANON_KEY, publishable: process.env.PUBLISHABLE_KEY }).filter(([, k]) => k);
if (!url || keys.length === 0) throw new Error('Set API_URL and ANON_KEY and/or PUBLISHABLE_KEY (npx supabase status -o env).');

const RELATIONS = ['participants', 'card_sort_placements', 'tree_test_results', 'completions', 'export_card_sort', 'export_tree_test', 'export_participants'];

for (const [name, key] of keys) {
  const db = createClient(url, key!, { auth: { persistSession: false } });
  const id = crypto.randomUUID();
  const participant = { id, study_id: 'rls-test', role: 'Ninguno', years_in_ieee: 1, member_grade: 'Student Member', officer_experience: false, wiki_use: 'Nunca' };

  test(`${name} key: can insert a full submission`, async () => {
    assert.equal((await db.from('participants').insert(participant)).error, null);
    assert.equal((await db.from('card_sort_placements').insert({ participant_id: id, study_id: 'rls-test', group_name: 'G', card_id: 'c1', card_label: 'C' })).error, null);
    const tree = {
      participant_id: id, study_id: 'rls-test', task_id: 't1', task_text: 'T', path_ids: ['a'], path_labels: ['A'],
      selected_node_id: 'a', selected_label: 'A', correct: true, backtrack_count: 0, time_to_first_click_ms: 1, hesitated: false, duration_ms: 2,
    };
    assert.equal((await db.from('tree_test_results').insert(tree)).error, null);
  });

  test(`${name} key: can insert the new fields ("no sé", omitida, confianza, marca de fin)`, async () => {
    const card = { participant_id: id, study_id: 'rls-test', group_name: null, card_id: 'c2', card_label: 'Rebate', not_understood: true, guess: 'dinero' };
    assert.equal((await db.from('card_sort_placements').insert(card)).error, null);
    const base = { participant_id: id, study_id: 'rls-test', task_text: 'T', path_ids: [], path_labels: [], backtrack_count: 0, time_to_first_click_ms: 1, hesitated: false, duration_ms: 1 };
    assert.equal((await db.from('tree_test_results').insert({ ...base, task_id: 't2', outcome: 'dont_know' })).error, null);
    assert.equal((await db.from('tree_test_results').insert({ ...base, task_id: 't3', outcome: 'skipped' })).error, null);
    const answered = { ...base, task_id: 't4', path_ids: ['a'], path_labels: ['A'], selected_node_id: 'a', selected_label: 'A', correct: false, outcome: 'failure', confidence: 2 };
    assert.equal((await db.from('tree_test_results').insert(answered)).error, null);
    assert.equal((await db.from('completions').insert({ participant_id: id })).error, null);
  });

  test(`${name} key: cannot read the new columns`, async () => {
    for (const [table, columns] of [['card_sort_placements', 'not_understood,guess'], ['tree_test_results', 'outcome,confidence'], ['completions', 'participant_id']]) {
      const { data, error } = await db.from(table).select(columns).limit(1);
      assert.equal(error?.code, '42501', `${table}: leaked ${JSON.stringify(data)}`);
    }
  });

  for (const relation of RELATIONS) {
    test(`${name} key: cannot read ${relation}`, async () => {
      const { data, error } = await db.from(relation).select('*').limit(1);
      assert.equal(error?.code, '42501', `expected permission denied, got data=${JSON.stringify(data)}`);
    });
  }

  test(`${name} key: cannot read back its own insert`, async () => {
    const { data, error } = await db.from('participants').insert({ ...participant, id: crypto.randomUUID() }).select();
    assert.equal(error?.code, '42501', `leaked ${JSON.stringify(data)}`);
  });

  test(`${name} key: keepalive ping succeeds and returns only a timestamp`, async () => {
    const { data, error } = await db.rpc('ping');
    assert.equal(error, null);
    assert.ok(!Number.isNaN(Date.parse(data)), `unexpected ${JSON.stringify(data)}`);
  });

  test(`${name} key: cannot update or delete`, async () => {
    assert.equal((await db.from('participants').update({ years_in_ieee: 9 }).eq('id', id)).error?.code, '42501');
    assert.equal((await db.from('participants').delete().eq('id', id)).error?.code, '42501');
  });

  test(`${name} key: GraphQL does not expose the tables`, async (t) => {
    const res = await fetch(`${url}/graphql/v1`, {
      method: 'POST',
      headers: { apikey: key!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ participantsCollection { edges { node { id } } } }' }),
    });
    const body = await res.json();
    // Without pg_graphql this check proves nothing; CI enables it before running these tests.
    if (JSON.stringify(body).includes('pg_graphql extension is not enabled')) return t.skip('pg_graphql not enabled');
    assert.equal(body.data?.participantsCollection, undefined, `leaked ${JSON.stringify(body)}`);
  });
}
