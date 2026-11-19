// POST {"participant_id": "<uuid>"} -> {"claim_url": "..."} once that participant finished the study.
// Deployed with verify_jwt = false: the participant id (random, known only to the browser that created it,
// never readable with the public key) is the bearer secret.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createClaimUrl, readConfig } from './token.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: object) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const cfg = readConfig((name) => Deno.env.get(name));
  if (!cfg) return json(503, { error: 'badges_not_configured' });

  const participantId = (await req.json().catch(() => ({})))?.participant_id;
  if (typeof participantId !== 'string' || !UUID.test(participantId)) return json(400, { error: 'invalid_participant_id' });

  // Completion is checked here with the service role, never taken from the client.
  // Answers are saved progressively, so only the end-of-study mark in "completions" counts
  // (the migration backfilled it for submissions made before progressive saving).
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { count, error } = await db
    .from('completions')
    .select('participant_id', { count: 'exact', head: true })
    .eq('participant_id', participantId);
  if (error) {
    console.error(error);
    return json(500, { error: 'internal_error' });
  }
  if (!count) return json(404, { error: 'not_completed' });

  return json(200, { claim_url: await createClaimUrl(cfg, participantId) });
});
