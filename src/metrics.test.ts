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
      { group_name: 'Apoyo', card_id: 'c1', card_label: 'Becas' },
      { group_name: 'Agenda', card_id: 'c2', card_label: 'Eventos' },
    ],
  );
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
