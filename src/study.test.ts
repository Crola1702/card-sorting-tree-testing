import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONSENT, parseCsv, parseStudyCsv, parseStudyJson, pickVariant, type Study } from './study.ts';

test('parseCsv handles quotes, escaped quotes, CRLF, BOM and blank lines', () => {
  const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\n"multi\nline",z');
  assert.deepEqual(rows, [['a', 'b'], ['x, y', 'say "hi"'], ['multi\nline', 'z']]);
});

test('parseCsv detects the semicolon separator used by Spanish Excel', () => {
  assert.deepEqual(parseCsv('type;text\ncard;Becas, premios'), [['type', 'text'], ['card', 'Becas, premios']]);
});

test('parseStudyCsv builds a tree test with nested nodes and multiple correct answers', () => {
  const study = parseStudyCsv('t', [
    'type,id,parent,text,correct',
    'title,,,Sitio de la rama,',
    'hesitation_ms,,,5000,',
    'node,n1,,Membresía,',
    'node,n2,n1,Renovar,',
    'node,n3,n1,Beneficios,',
    'task,t1,,Renueva tu membresía,n2|n3',
  ].join('\n'));
  assert.equal(study.kind, 'tree_test');
  if (study.kind !== 'tree_test') return;
  assert.equal(study.hesitationMs, 5000);
  assert.deepEqual(study.tree[0].children.map((c) => c.id), ['n2', 'n3']);
  assert.deepEqual(study.tree[0].children[0].children, []);
  assert.deepEqual(study.tasks[0].correct, ['n2', 'n3']);
});

test('parseStudyCsv builds a card sort', () => {
  const study = parseStudyCsv('c', 'type,id,text\ntitle,,Organiza\ncard,c1,Becas\ncard,c2,Eventos');
  assert.equal(study.kind, 'card_sort');
  if (study.kind === 'card_sort') assert.deepEqual(study.cards, [{ id: 'c1', label: 'Becas' }, { id: 'c2', label: 'Eventos' }]);
});

test('consent text defaults when missing and can be overridden in JSON and CSV', () => {
  const json = { kind: 'card_sort', title: 'T', cards: [{ id: 'c', label: 'x' }] };
  assert.equal((parseStudyJson('x', json) as Study).consent, DEFAULT_CONSENT);
  assert.equal((parseStudyJson('x', { ...json, consent: ' Propio ' }) as Study).consent, 'Propio');
  assert.equal(parseStudyCsv('x', 'type,id,text\ntitle,,T\nconsent,,Texto CSV\ncard,c,x').consent, 'Texto CSV');
});

test('parseStudyCsv rejects parent cycles and unknown parents', () => {
  assert.throws(() => parseStudyCsv('x', 'type,id,parent,text,correct\ntitle,,,T,\nnode,a,b,A,\nnode,b,a,B,\ntask,t,,T,a'), /ciclo/);
  assert.throws(() => parseStudyCsv('x', 'type,id,parent,text\ntitle,,,T\nnode,a,zz,A'), /padre inexistente/);
});

test('parseStudyJson rejects tasks pointing to missing nodes, duplicate ids and over-long labels', () => {
  const base = { kind: 'tree_test', title: 'T', tree: [{ id: 'n1', label: 'A' }], tasks: [{ id: 't1', text: 'x', correct: ['n1'] }] };
  assert.doesNotThrow(() => parseStudyJson('x', base));
  assert.throws(() => parseStudyJson('x', { ...base, tasks: [{ id: 't1', text: 'x', correct: ['nope'] }] }), /no existe/);
  assert.throws(() => parseStudyJson('x', { ...base, tree: [{ id: 'n1', label: 'A' }, { id: 'n1', label: 'B' }] }), /repetido/);
  assert.throws(() => parseStudyJson('x', { kind: 'card_sort', title: 'T', cards: [{ id: 'c', label: 'x'.repeat(301) }] }), /supera/);
  assert.throws(() => parseStudyJson('x', { kind: 'otro', title: 'T' }), /kind/);
});

test('split studies validate their variants and pick one at random', () => {
  const split = parseStudyJson('arbol-wiki', { kind: 'split', variants: ['arbol-a', 'arbol-b'] });
  assert.deepEqual(split, { id: 'arbol-wiki', kind: 'split', variants: ['arbol-a', 'arbol-b'] });
  if (split.kind !== 'split') return;
  assert.equal(pickVariant(split, () => 0), 'arbol-a');
  assert.equal(pickVariant(split, () => 0.999), 'arbol-b');
  assert.equal(pickVariant(split, () => 1), 'arbol-b'); // never out of range
  assert.throws(() => parseStudyJson('s', { kind: 'split', variants: ['solo'] }), /al menos dos/);
  assert.throws(() => parseStudyJson('s', { kind: 'split', variants: ['a', 'a'] }), /repetido/);
  assert.throws(() => parseStudyJson('s', { kind: 'split', variants: ['s', 'b'] }), /sí mismo/);
  assert.throws(() => parseStudyJson('s', { kind: 'split', variants: ['../x', 'b'] }), /no es un id/);
});
