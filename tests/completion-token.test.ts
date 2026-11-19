import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { AUDIENCE, EVIDENCE, TOKEN_TTL_S, createClaimUrl, deriveSub, readConfig, type BadgeConfig } from '../supabase/functions/completion-token/token.ts';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const cfg: BadgeConfig = {
  privateJwk: privateKey.export({ format: 'jwk' }) as JsonWebKey,
  kid: 'test-kid',
  clientId: 'card-tree-testing',
  slug: 'test-participant',
  claimBaseUrl: 'https://issuer.example/badges/',
  subKey: 'k'.repeat(43),
};
const participant = '3f8a1c9e-2b4d-4e6f-8a0b-1c2d3e4f5a6b';

const fromB64url = (s: string) => Buffer.from(s, 'base64url');
async function verify(jws: string) {
  const [h, p, s] = jws.split('.');
  const key = await crypto.subtle.importKey('jwk', publicKey.export({ format: 'jwk' }) as JsonWebKey, { name: 'Ed25519' }, false, ['verify']);
  const valid = await crypto.subtle.verify({ name: 'Ed25519' }, key, fromB64url(s), new TextEncoder().encode(`${h}.${p}`));
  return { valid, header: JSON.parse(fromB64url(h).toString()), payload: JSON.parse(fromB64url(p).toString()) };
}

test('claim URL carries a JWS in the fragment, signed with the configured Ed25519 key', async () => {
  const url = await createClaimUrl(cfg, participant, 1_700_000_000_000);
  assert.match(url, /^https:\/\/issuer\.example\/badges\/claim\.html#token=[\w-]+\.[\w-]+\.[\w-]+$/);
  const { valid, header, payload } = await verify(url.split('#token=')[1]);
  assert.equal(valid, true);
  assert.deepEqual(header, { alg: 'EdDSA', typ: 'JWT', kid: 'test-kid' });
  assert.equal(payload.iss, 'card-tree-testing');
  assert.equal(payload.aud, AUDIENCE);
  assert.equal(payload.badge, 'test-participant');
  assert.equal(payload.iat, 1_700_000_000);
  assert.equal(payload.exp - payload.iat, TOKEN_TTL_S);
  assert.ok(TOKEN_TTL_S <= 30 * 24 * 3600);
  assert.equal(payload.evidence, EVIDENCE);
  assert.ok(EVIDENCE.length <= 200);
  assert.match(payload.jti, /^[0-9a-f-]{36}$/);
});

test('a tampered token fails verification', async () => {
  const jws = (await createClaimUrl(cfg, participant)).split('#token=')[1];
  const [h, , s] = jws.split('.');
  const forged = Buffer.from(JSON.stringify({ badge: 'admin' })).toString('base64url');
  assert.equal((await verify(`${h}.${forged}.${s}`)).valid, false);
});

test('sub is stable per participant, pseudonymous and within 128 chars; jti changes per token', async () => {
  const a = (await verify((await createClaimUrl(cfg, participant)).split('#token=')[1])).payload;
  const b = (await verify((await createClaimUrl(cfg, participant)).split('#token=')[1])).payload;
  assert.equal(a.sub, b.sub);
  assert.notEqual(a.jti, b.jti);
  assert.ok(a.sub.length <= 128);
  assert.ok(!a.sub.includes(participant) && !a.sub.includes(participant.replaceAll('-', '')));
  assert.notEqual(await deriveSub(cfg.subKey, participant), await deriveSub(cfg.subKey, '00000000-0000-4000-8000-000000000000'));
  assert.notEqual(await deriveSub(cfg.subKey, participant), await deriveSub('other-key', participant));
});

test('readConfig turns the feature off when any setting is missing', () => {
  const env: Record<string, string> = {
    BADGE_TOKEN_PRIVATE_JWK: JSON.stringify(cfg.privateJwk),
    BADGE_TOKEN_KID: 'k',
    BADGE_CLIENT_ID: 'card-tree-testing',
    BADGE_SLUG: 'test-participant',
    BADGE_CLAIM_BASE_URL: 'https://x',
    BADGE_SUB_HMAC_KEY: 's',
  };
  assert.notEqual(readConfig((n) => env[n]), null);
  for (const name of Object.keys(env)) assert.equal(readConfig((n) => (n === name ? undefined : env[n])), null, name);
});
