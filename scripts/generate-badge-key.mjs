// Generates the badge signing key (Ed25519) and the sub HMAC key into .secrets/badge.env (git-ignored).
// Prints only the PUBLIC JWK and kid, which are what the issuer registers.
//   npm run badge:keygen
//   npx supabase secrets set --env-file .secrets/badge.env
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const file = '.secrets/badge.env';
if (existsSync(file)) {
  console.error(`${file} already exists. Rotating keys breaks pending tokens; move it away first if you mean it.`);
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const kid = `card-tree-testing-${new Date().toISOString().slice(0, 10)}`;
const privateJwk = { ...privateKey.export({ format: 'jwk' }), kid, alg: 'EdDSA', use: 'sig' };
const publicJwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'EdDSA', use: 'sig' };

mkdirSync('.secrets', { recursive: true, mode: 0o700 });
writeFileSync(
  file,
  [
    `BADGE_TOKEN_PRIVATE_JWK='${JSON.stringify(privateJwk)}'`,
    `BADGE_TOKEN_KID=${kid}`,
    `BADGE_SUB_HMAC_KEY=${randomBytes(32).toString('base64url')}`,
    'BADGE_CLIENT_ID=card-tree-testing',
    'BADGE_SLUG=test-participant',
    '# Replace with the issuer GitHub Pages URL once known:',
    'BADGE_CLAIM_BASE_URL=https://example.invalid/open-badges',
    '',
  ].join('\n'),
  { mode: 0o600 },
);

console.log(`Wrote ${file} (private, never commit or share it).`);
console.log('Public JWK for the issuer (claim_clients):');
console.log(JSON.stringify(publicJwk));
