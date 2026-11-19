// Badge completion token, contract v1 with open-badges-ieee (see README "Badge claim").
// Runtime-neutral (WebCrypto only) so it runs in Deno (Edge Function) and Node (tests).

export const AUDIENCE = 'sac-ieee-colombia-badges';
export const TOKEN_TTL_S = 30 * 24 * 60 * 60; // the issuer rejects anything longer
export const EVIDENCE = 'Completed a usability study in the IEEE Colombia card sorting and tree testing tool.';

export type BadgeConfig = {
  privateJwk: JsonWebKey;
  kid: string;
  clientId: string;
  slug: string;
  claimBaseUrl: string;
  subKey: string;
};

// Returns null when any setting is missing, so the badge feature stays off instead of failing.
export function readConfig(env: (name: string) => string | undefined): BadgeConfig | null {
  const jwk = env('BADGE_TOKEN_PRIVATE_JWK');
  const kid = env('BADGE_TOKEN_KID');
  const clientId = env('BADGE_CLIENT_ID');
  const slug = env('BADGE_SLUG');
  const claimBaseUrl = env('BADGE_CLAIM_BASE_URL');
  const subKey = env('BADGE_SUB_HMAC_KEY');
  if (!jwk || !kid || !clientId || !slug || !claimBaseUrl || !subKey) return null;
  return { privateJwk: JSON.parse(jwk), kid, clientId, slug, claimBaseUrl, subKey };
}

const encoder = new TextEncoder();

export function base64url(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? encoder.encode(input) : input;
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Stable pseudonym per completion. HMAC instead of the raw participant id so the issuer, which learns
// the person's name, cannot join it with the research data without the key that only this project holds.
export async function deriveSub(subKey: string, participantId: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(subKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(`completion:v1:${participantId}`));
  return base64url(new Uint8Array(mac)); // 43 chars
}

export async function signJws(header: object, payload: object, privateJwk: JsonWebKey): Promise<string> {
  const key = await crypto.subtle.importKey('jwk', privateJwk, { name: 'Ed25519' }, false, ['sign']);
  const input = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = await crypto.subtle.sign({ name: 'Ed25519' }, key, encoder.encode(input));
  return `${input}.${base64url(new Uint8Array(signature))}`;
}

export async function createClaimUrl(cfg: BadgeConfig, participantId: string, nowMs = Date.now()): Promise<string> {
  const iat = Math.floor(nowMs / 1000);
  const payload = {
    iss: cfg.clientId,
    aud: AUDIENCE,
    sub: await deriveSub(cfg.subKey, participantId),
    badge: cfg.slug,
    jti: crypto.randomUUID(),
    iat,
    exp: iat + TOKEN_TTL_S,
    evidence: EVIDENCE,
  };
  const jws = await signJws({ alg: 'EdDSA', typ: 'JWT', kid: cfg.kid }, payload, cfg.privateJwk);
  // Fragment, not query string: the token never reaches any server log.
  return `${cfg.claimBaseUrl.replace(/\/+$/, '')}/claim.html#token=${jws}`;
}
