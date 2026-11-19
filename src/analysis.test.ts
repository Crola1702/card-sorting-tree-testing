import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeCardSort, analyzeTreeTest, averageLinkage, filterParticipants, ratio, type CardRow, type ParticipantRow, type TreeRow } from './analysis.ts';

const person = (id: string, extra: Partial<ParticipantRow> = {}): ParticipantRow => ({
  participant_id: id, study_id: 's', role: 'Ninguno', years_in_ieee: 1, member_grade: 'Student Member',
  officer_experience: false, wiki_use: 'Nunca', completed: true, ...extra,
});
const card = (p: string, id: string, group: string | null, extra: Partial<CardRow> = {}): CardRow => ({
  participant_id: p, study_id: 's', group_name: group, card_id: id, card_label: id.toUpperCase(),
  not_understood: group === null, guess: null, ...extra,
});
const task = (p: string, id: string, outcome: string | null, extra: Partial<TreeRow> = {}): TreeRow => ({
  participant_id: p, study_id: 's', task_id: id, task_text: `Tarea ${id}`, outcome,
  correct: outcome === 'success' ? true : outcome === 'failure' ? false : null, backtracked: false, confidence: null, ...extra,
});

test('card sort: % "no sé" per card uses those who submitted the sort; marks leave the matrix', () => {
  const rows = [
    card('p1', 'a', 'G1'), card('p1', 'b', 'G1'), card('p1', 'c', null, { guess: 'algo de dinero' }),
    card('p2', 'a', 'X'), card('p2', 'b', 'Y'), card('p2', 'c', 'Y'),
  ];
  const r = analyzeCardSort(rows, new Set(['p1', 'p2', 'p3'])); // p3 empezó y no envió
  assert.equal(r.started, 3);
  assert.equal(r.sorters, 2);
  assert.deepEqual(r.cards.map((c) => [c.card_id, c.not_understood, c.pct_not_understood]), [['c', 1, 0.5], ['a', 0, 0], ['b', 0, 0]]);
  assert.deepEqual(r.cards[0].guesses, ['algo de dinero']);
  assert.deepEqual(r.excluded, { marks: 1, participants: 1, cards: [] });
  const sim = (x: string, y: string) => r.matrix.sim[r.matrix.ids.indexOf(x)][r.matrix.ids.indexOf(y)];
  assert.equal(sim('a', 'b'), 0.5); // juntas para p1, separadas para p2
  assert.equal(sim('b', 'c'), 1); // solo p2 agrupó ambas (p1 marcó "c"), y las puso juntas
  assert.equal(sim('a', 'a'), 1);
});

test('card sort: every card marked "no sé" leaves an empty matrix and no dendrogram', () => {
  const r = analyzeCardSort([card('p1', 'a', null), card('p1', 'b', null)], new Set(['p1']));
  assert.deepEqual(r.cards.map((c) => c.pct_not_understood), [1, 1]);
  assert.deepEqual(r.matrix.ids, []);
  assert.deepEqual(r.excluded, { marks: 2, participants: 1, cards: ['A', 'B'] });
  assert.equal(averageLinkage(r.matrix.ids, r.matrix.sim), null);
});

test('card sort: rows saved before the migration (no not_understood field) count as understood', () => {
  const legacy = [{ participant_id: 'p1', study_id: 's', group_name: 'G', card_id: 'a', card_label: 'A' }] as CardRow[];
  const r = analyzeCardSort(legacy, new Set(['p1']));
  assert.equal(r.cards[0].not_understood, 0);
  assert.deepEqual(r.matrix.ids, ['a']);
});

test('dendrogram merges the most similar cards first (average linkage)', () => {
  const ids = ['a', 'b', 'c'];
  const sim = [[1, 0.9, 0.1], [0.9, 1, 0.3], [0.1, 0.3, 1]];
  const root = averageLinkage(ids, sim)!;
  assert.deepEqual(root.ids.length, 3);
  const first = [root.left!, root.right!].find((c) => c.ids.length === 2)!;
  assert.deepEqual([...first.ids].sort(), ['a', 'b']);
  assert.ok(Math.abs(first.height - 0.1) < 1e-9);
  assert.ok(Math.abs(root.height - 0.8) < 1e-9); // promedio de 1-0.1 y 1-0.3
});

test('tree test: each state has its own base and abstentions are never success or failure', () => {
  const people = ['p1', 'p2', 'p3', 'p4', 'p5'].map((id) => person(id));
  const rows = [
    task('p1', 't1', 'success', { confidence: 5 }),
    task('p2', 't1', 'success', { backtracked: true, confidence: 3 }),
    task('p3', 't1', 'failure'),
    task('p4', 't1', 'dont_know'),
    // p5 no llegó a t1: abandono
  ];
  const [t] = analyzeTreeTest(people, rows);
  assert.deepEqual(
    { started: t.started, skipped: t.skipped, abandoned: t.abandoned, responded: t.responded, dont_know: t.dont_know, chose: t.chose, success: t.success, direct: t.direct, failure: t.failure },
    { started: 5, skipped: 0, abandoned: 1, responded: 4, dont_know: 1, chose: 3, success: 2, direct: 1, failure: 1 },
  );
  assert.equal(t.pct.success, 2 / 3);
  assert.equal(t.pct.direct, 1 / 3);
  assert.equal(t.pct.failure, 1 / 3);
  assert.equal(t.pct.dont_know, 1 / 4);
  assert.equal(t.pct.abandoned, 1 / 5);
  assert.equal(t.confidence_avg, 4);
});

test('tree test: a task skipped by everyone has no success or failure rate, only 100% skipped', () => {
  const people = [person('p1'), person('p2')];
  const [t] = analyzeTreeTest(people, [task('p1', 't1', 'skipped'), task('p2', 't1', 'skipped')]);
  assert.equal(t.pct.skipped, 1);
  assert.equal(t.responded, 0);
  assert.equal(t.pct.dont_know, null);
  assert.equal(t.pct.success, null);
  assert.equal(t.pct.failure, null);
  assert.equal(t.confidence_avg, null);
});

test('tree test: rows saved before the migration (outcome missing) use "correct"', () => {
  const legacy = [
    { participant_id: 'p1', study_id: 's', task_id: 't1', task_text: 'x', correct: true, backtracked: false },
    { participant_id: 'p2', study_id: 's', task_id: 't1', task_text: 'x', correct: false, backtracked: true },
  ] as TreeRow[];
  const [t] = analyzeTreeTest([person('p1'), person('p2')], legacy);
  assert.deepEqual([t.success, t.failure, t.dont_know, t.skipped, t.abandoned], [1, 1, 0, 0, 0]);
});

test('profile filter applies to the metrics (non-members vs members)', () => {
  const people = [person('p1', { member_grade: 'No soy miembro' }), person('p2', { member_grade: 'Member', years_in_ieee: 4 })];
  const rows = [task('p1', 't1', 'dont_know'), task('p2', 't1', 'success')];
  const [nonMembers] = analyzeTreeTest(filterParticipants(people, { member_grade: 'No soy miembro' }), rows);
  assert.deepEqual([nonMembers.started, nonMembers.dont_know, nonMembers.chose], [1, 1, 0]);
  const [veterans] = analyzeTreeTest(filterParticipants(people, { min_years: 3 }), rows);
  assert.deepEqual([veterans.started, veterans.success], [1, 1]);
  assert.equal(ratio(1, 0), null);
});
