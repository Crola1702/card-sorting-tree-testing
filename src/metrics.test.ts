import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlacements, scoreTask, type NavStep } from './metrics.ts';
import { csvCell, toCsv } from './csv-export.ts';

const root = { id: '(inicio)', label: 'Inicio', children: [] };
const mem = { id: 'mem', label: 'Membresía', children: [] };
const act = { id: 'act', label: 'Actividades', children: [] };
const cer = { id: 'act-cer', label: 'Certificados', children: [] };
const task = { id: 't1', text: 'Descarga tu certificado', correct: ['act-cer'] };

test('direct correct answer: no backtrack, no hesitation', () => {
  const steps: NavStep[] = [{ node: act, back: false, at: 1_500 }, { node: cer, back: false, at: 2_000 }];
  const r = scoreTask(task, steps, cer, 1_000, 3_000, 10_000);
  assert.deepEqual(r.path_ids, ['act', 'act-cer']);
  assert.deepEqual(r.path_labels, ['Actividades', 'Certificados']);
  assert.equal(r.correct, true);
  assert.equal(r.backtrack_count, 0);
  assert.equal(r.time_to_first_click_ms, 500);
  assert.equal(r.hesitated, false);
  assert.equal(r.duration_ms, 2_000);
});

test('going back is counted and recorded in the path', () => {
  const steps: NavStep[] = [
    { node: mem, back: false, at: 100 },
    { node: root, back: true, at: 200 },
    { node: act, back: false, at: 300 },
    { node: cer, back: false, at: 400 },
  ];
  const r = scoreTask(task, steps, cer, 0, 500, 10_000);
  assert.deepEqual(r.path_ids, ['mem', '(inicio)', 'act', 'act-cer']);
  assert.equal(r.backtrack_count, 1);
});

test('wrong answer and hesitation threshold is strictly greater than', () => {
  const at = (ms: number): NavStep[] => [{ node: act, back: false, at: ms }];
  assert.equal(scoreTask(task, at(10_000), act, 0, 12_000, 10_000).hesitated, false);
  const late = scoreTask(task, at(10_001), act, 0, 12_000, 10_000);
  assert.equal(late.hesitated, true);
  assert.equal(late.correct, false);
});

test('any of several correct answers counts as correct', () => {
  const multi = { ...task, correct: ['mem', 'act-cer'] };
  assert.equal(scoreTask(multi, [{ node: mem, back: false, at: 1 }], mem, 0, 2, 10_000).correct, true);
});

test('times are rounded and never negative', () => {
  const r = scoreTask(task, [{ node: cer, back: false, at: 99.6 }], cer, 100, 1_100.4, 10_000);
  assert.equal(r.time_to_first_click_ms, 0);
  assert.equal(r.duration_ms, 1_000);
});

test('buildPlacements requires every card grouped and named groups, ignores empty groups', () => {
  const labels = new Map([['c1', 'Becas'], ['c2', 'Eventos']]);
  assert.match(buildPlacements(['c1'], [], labels) as string, /1 tarjetas/);
  assert.match(buildPlacements([], [{ key: 'g1', name: '  ', cardIds: ['c1', 'c2'] }], labels) as string, /nombre/);
  assert.deepEqual(
    buildPlacements([], [
      { key: 'g1', name: ' Apoyo ', cardIds: ['c1'] },
      { key: 'g2', name: '', cardIds: [] },
      { key: 'g3', name: 'Agenda', cardIds: ['c2'] },
    ], labels),
    [
      { group_name: 'Apoyo', card_id: 'c1', card_label: 'Becas', not_understood: false, guess: null },
      { group_name: 'Agenda', card_id: 'c2', card_label: 'Eventos', not_understood: false, guess: null },
    ],
  );
});

test('"no sé" and "omitida" end the task with no node, no correct flag and their own outcome', () => {
  const back: NavStep[] = [{ node: act, back: false, at: 300 }, { node: root, back: true, at: 600 }];
  const dk = scoreTask(task, back, 'dont_know', 0, 1_000, 10_000);
  assert.deepEqual([dk.outcome, dk.correct, dk.selected_node_id, dk.selected_label, dk.confidence], ['dont_know', null, null, null, null]);
  assert.deepEqual(dk.path_ids, ['act', '(inicio)']);
  assert.equal(dk.backtrack_count, 1);
  const skip = scoreTask(task, [], 'skipped', 0, 2_000, 10_000);
  assert.deepEqual([skip.outcome, skip.correct, skip.path_ids.length, skip.time_to_first_click_ms, skip.duration_ms], ['skipped', null, 0, 2_000, 2_000]);
  assert.equal(scoreTask(task, [], cer, 0, 1, 10_000).outcome, 'success');
  assert.equal(scoreTask(task, [], act, 0, 1, 10_000).outcome, 'failure');
});

test('buildPlacements stores "no sé" cards without a group, with an optional trimmed guess', () => {
  const labels = new Map([['c1', 'Becas'], ['c2', 'Rebate']]);
  const rows = buildPlacements([], [{ key: 'g1', name: 'Apoyo', cardIds: ['c1'] }], labels, new Map([['c2', '  dinero  ']]));
  assert.deepEqual(rows, [
    { group_name: 'Apoyo', card_id: 'c1', card_label: 'Becas', not_understood: false, guess: null },
    { group_name: null, card_id: 'c2', card_label: 'Rebate', not_understood: true, guess: 'dinero' },
  ]);
  // Todas marcadas: se puede enviar sin ningún grupo, y una suposición vacía se guarda como null.
  assert.deepEqual(buildPlacements([], [], labels, new Map([['c1', ''], ['c2', 'x'.repeat(250)]])), [
    { group_name: null, card_id: 'c1', card_label: 'Becas', not_understood: true, guess: null },
    { group_name: null, card_id: 'c2', card_label: 'Rebate', not_understood: true, guess: 'x'.repeat(200) },
  ]);
});

test('CSV export quotes, escapes formulas and keeps numbers/booleans intact', () => {
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('dice "hola"'), '"dice ""hola"""');
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell(-5), '-5');
  assert.equal(csvCell(false), 'false');
  assert.equal(csvCell(null), '');
  assert.equal(toCsv(['a', 'b'], [{ a: 1, b: 'x\ny' }]), '﻿a,b\r\n1,"x\ny"\r\n');
});
