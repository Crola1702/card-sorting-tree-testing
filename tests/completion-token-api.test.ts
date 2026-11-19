// End-to-end: the deployed completion-token function against the local stack.
// Needs `npx supabase functions serve --env-file .secrets/badge.env` and, in this shell,
// API_URL + ANON_KEY (supabase status) and the badge.env variables (set -a; . .secrets/badge.env).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { deriveSub } from '../supabase/functions/completion-token/token.ts';

const { API_URL, ANON_KEY, BADGE_TOKEN_PRIVATE_JWK, BADGE_SUB_HMAC_KEY, BADGE_TOKEN_KID } = process.env;
if (!API_URL || !ANON_KEY || !BADGE_TOKEN_PRIVATE_JWK || !BADGE_SUB_HMAC_KEY) {
  throw new Error('Set API_URL, ANON_KEY and the .secrets/badge.env variables.');
}
const db = createClient(API_URL, ANON_KEY, { auth: { persistSession: false } });
const { d: _private, ...publicJwk } = JSON.parse(BADGE_TOKEN_PRIVATE_JWK);

const call = (body: unknown) =>
  fetch(`${API_URL}/functions/v1/completion-token`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

async function newParticipant(withResults: boolean) {
  const id = crypto.randomUUID();
  const p = await db.from('participants').insert({ id, study_id: 'badge-test', role: 'Ninguno', years_in_ieee: 1, member_grade: 'Student Member', officer_experience: false, wiki_use: 'Nunca' });
  assert.equal(p.error, null);
  if (withResults) {
    const r = await db.from('card_sort_placements').insert({ participant_id: id, study_id: 'badge-test', group_name: 'G', card_id: 'c1', card_label: 'C' });
    assert.equal(r.error, null);
  }
  return id;
}

test('rejects malformed participant ids', async () => {
  const res = await call({ participant_id: "x' or 1=1" });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'invalid_participant_id' });
});

test('refuses unknown participants and participants without results', async () => {
  for (const id of [crypto.randomUUID(), await newParticipant(false)]) {
    const res = await call({ participant_id: id });
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'not_completed' });
  }
});

test('returns a verifiable claim URL for a completed participant, with a stable sub', async () => {
  const id = await newParticipant(true);
  const tokens = [];
  for (let i = 0; i < 2; i++) {
    const res = await call({ participant_id: id });
    assert.equal(res.status, 200);
    const { claim_url } = await res.json();
    tokens.push(claim_url.split('#token=')[1]);
  }
  const key = await crypto.subtle.importKey('jwk', publicJwk, { name: 'Ed25519' }, false, ['verify']);
  const payloads = [];
  for (const jws of tokens) {
    const [h, p, s] = jws.split('.');
    const valid = await crypto.subtle.verify({ name: 'Ed25519' }, key, Buffer.from(s, 'base64url'), new TextEncoder().encode(`${h}.${p}`));
    assert.equal(valid, true);
    assert.equal(JSON.parse(Buffer.from(h, 'base64url').toString()).kid, BADGE_TOKEN_KID);
    payloads.push(JSON.parse(Buffer.from(p, 'base64url').toString()));
  }
  assert.equal(payloads[0].sub, await deriveSub(BADGE_SUB_HMAC_KEY, id));
  assert.equal(payloads[0].sub, payloads[1].sub);
  assert.notEqual(payloads[0].jti, payloads[1].jti);
});

test('works through supabase-js functions.invoke as the browser calls it', async () => {
  const { data, error } = await db.functions.invoke('completion-token', { body: { participant_id: await newParticipant(true) } });
  assert.equal(error, null);
  assert.match(data.claim_url, /\/claim\.html#token=/);
});
