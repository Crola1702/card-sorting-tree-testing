# Card sorting & tree testing (IEEE)

Static web app (GitHub Pages) that collects open card sorting and tree testing data into Supabase (free plan).
The participant UI is in Spanish and mobile-first. Participants can only **insert** data; nobody can read it
without the service role key.

Participant flow: intro + consent → profile (Colombian department, years in IEEE, branch officer) → activity → submit (with retry).

- To publish a new study, see [docs/new-study.md](docs/new-study.md).
- Study file reference (all fields): [Study files](#study-files).

## Contents

- [Privacy and consent](#privacy-and-consent)
- [Deploy](#deploy)
- [Modify the app](#modify-the-app)
- [Tests](#tests)
- [Operations: keepalive and pausing](#operations-keepalive-and-pausing)
- [Badge claim (open-badges-ieee)](#badge-claim-open-badges-ieee)
- [Export results to CSV](#export-results-to-csv)
- [Study files](#study-files)
- [Recorded data](#recorded-data)

## Privacy and consent

**Stored** (only after the participant accepts the consent notice and finishes the activity):

| Data | Why |
|---|---|
| Colombian department (fixed list, or "Prefiero no decirlo") | Requested profile segment |
| Years in IEEE, whether they were a branch officer | Requested profile segment |
| Card groups / tree navigation, timings | The study itself |
| Random participant UUID, timestamps | Link a participant's rows; no relation to their identity |

**Not stored**: name, email, IP address, user agent, location, cookies or browser storage
(`persistSession: false`, no analytics, no third-party scripts).

Things outside the app's control, worth stating to an ethics reviewer:

- Supabase and GitHub Pages keep their own request logs (including IP addresses) for a limited time.
- Badge claims (optional, see [Badge claim](#badge-claim-open-badges-ieee)): the issuer receives a pseudonymous
  `sub` and then asks the person for name and email on its own page. This project stores nothing new. Whoever
  holds both `BADGE_SUB_HMAC_KEY` and the issuer's database can link a name to a participant's answers, so keep
  that key in Supabase secrets only and never export it next to issuer data.
- Profile fields are quasi-identifiers: in a small section, "section + years + officer" can point to one person.
  Report results in aggregate and do not publish per-participant rows.

The consent notice is shown before anything else and must be accepted with a checkbox. The default text is
`DEFAULT_CONSENT` in `src/study.ts`; each study can override it with a `consent` field. **If you change what is
collected, update that text in the same change.**

## Deploy

### One-time setup

1. **Supabase**: create a project on the free plan. Note the *project ref* (in the URL), the *database password*
   and, under Project Settings → API keys, the *anon/publishable* key and the *service role/secret* key.
2. **Supabase access token**: create one at <https://supabase.com/dashboard/account/tokens>.
3. **GitHub repo → Settings → Pages**: Source = **GitHub Actions**.
4. **GitHub repo → Settings → Secrets and variables → Actions**:

   | Kind | Name | Value |
   |---|---|---|
   | Secret | `SUPABASE_ACCESS_TOKEN` | token from step 2 |
   | Secret | `SUPABASE_DB_PASSWORD` | database password |
   | Variable | `SUPABASE_PROJECT_REF` | project ref |
   | Variable | `SUPABASE_URL` | `https://<ref>.supabase.co` |
   | Variable | `SUPABASE_ANON_KEY` | anon or publishable key (public by design) |

   The service role / secret key is **never** stored in GitHub; it is only used locally to export.

5. Push to `main`.

### What the workflow does (`.github/workflows/ci.yml`)

| Job | When | What |
|---|---|---|
| `test` | every push and PR | typecheck + unit tests |
| `test-db` | every push and PR | starts Supabase in Docker, runs pgTAP RLS tests and API tests with the public keys |
| `migrate` | push to `main`, after both tests pass | `supabase link` + `supabase db push --remote` (applies only new migrations) + `supabase functions deploy completion-token` |
| `deploy` | after `migrate` | builds with the public URL/key and publishes to GitHub Pages |

A failing test blocks migrations and deployment. Re-run manually from the Actions tab (`workflow_dispatch`).

### Manual deploy with the Supabase CLI

The CLI is a dev dependency, so `npx supabase` uses the pinned version.

```sh
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push --remote          # applies pending migrations to the linked project
npx supabase migration list --remote   # shows which migrations are applied remotely
```

The frontend only deploys through the workflow (or build locally with `npm run build` and upload `dist/`).

## Modify the app

| To change… | Edit | Then |
|---|---|---|
| UI texts (Spanish) | `src/main.ts`, `src/cardsort.ts`, `src/treetest.ts` | `npm run dev` and check on a phone-sized window |
| Default consent text | `DEFAULT_CONSENT` in `src/study.ts` | keep it true to what is stored |
| How answers are scored (correct, hesitation, backtracks) | `src/metrics.ts` | update `src/metrics.test.ts` |
| Study file format | `src/study.ts` | update `src/study.test.ts`, this README and `docs/new-study.md` |
| Database schema | new migration (below) | update `supabase/tests/rls.test.sql`, `tests/rls-api.test.ts`, the export views |
| Profile fields | migration + `profileForm` in `src/main.ts` + `DEFAULT_CONSENT` | ask whether the field is really needed |
| Styles | `src/style.css` (colors are variables in `:root`, with a dark mode block) | |

### Schema changes

Never edit a migration that is already applied; add a new one:

```sh
npx supabase migration new add_something   # creates supabase/migrations/<timestamp>_add_something.sql
npx supabase db reset                       # rebuilds the local DB from all migrations
npm run test:db                             # pgTAP tests
```

Every new table must: `enable row level security`, `revoke all … from anon, authenticated`, grant only what is
needed, and get a read-denial test in both `supabase/tests/rls.test.sql` and `tests/rls-api.test.ts`.
Merging to `main` applies it to production.

## Tests

| Command | Needs | Covers |
|---|---|---|
| `npm test` | Node 24+ | study parser (JSON/CSV, validation), scoring (`metrics.ts`), CSV export escaping, badge token signing and `sub` |
| `npm run test:db` | Docker, `npx supabase start` | RLS in SQL: anon may insert, never read/update/delete; check constraints |
| `npm run test:api` | Docker, local stack + function server + env below | RLS through the real API with the anon and publishable keys (including GraphQL); `completion-token` end to end |

```sh
npx supabase start
npm run badge:keygen   # only if .secrets/badge.env does not exist yet
npx supabase functions serve --env-file .secrets/badge.env &
eval "$(npx supabase status -o env | grep -E '^(API_URL|ANON_KEY|PUBLISHABLE_KEY)=')"
export API_URL ANON_KEY PUBLISHABLE_KEY
set -a; . .secrets/badge.env; set +a
npm run test:api
```

The GraphQL check is reported as *skipped* unless `pg_graphql` is enabled locally; CI enables it.

## Operations: keepalive and pausing

Free Supabase projects pause after low activity over a 7-day period (Supabase docs: a few daily requests avoid
it). `.github/workflows/keepalive.yml` runs daily and calls `public.ping()`, a function that only returns the
server time, with the public key. If the call fails, the run fails and GitHub emails the repository owner.

Run it by hand: Actions → *Keep Supabase awake* → *Run workflow*, or `gh workflow run keepalive.yml`.

**GitHub disables scheduled workflows in a public repository after 60 days without repository activity.**
The Actions tab then shows a banner on the workflow. Re-enable it with *Enable workflow* or
`gh workflow enable keepalive.yml`; any push also counts as activity.

### If the project was paused anyway

1. Supabase Dashboard → the organization → the paused project → **Resume project**, and confirm.
   It comes back with its data and configuration. The docs give a restore window of up to one year after pausing.
2. Check the keepalive workflow is enabled (above) and run it once by hand.
3. Open a study link and confirm it loads; the participants' answers saved before the pause are still there.

## Badge claim (open-badges-ieee)

Participants who finish a study can claim the `test-participant` Open Badge from the separate issuer project
(`open-badges-ieee`). Integration is API only: no shared code or database.

### Flow

1. The participant finishes; the app saves the answers (participant row, then all results).
2. The browser calls the Edge Function `completion-token` with `{"participant_id": "<uuid>"}`.
3. The function checks **in the database, with the service role** that this participant has result rows.
   Unknown or incomplete participants get `404 {"error":"not_completed"}`.
4. It returns `{"claim_url": "<BADGE_CLAIM_BASE_URL>/claim.html#token=<jws>"}`; the completion screen shows
   "Reclamar mi insignia". The token is in the URL fragment, so it never reaches a server log.
5. On the issuer page the person types name and email; the issuer verifies the token with our **public** key
   and issues the badge, deduplicating by `sub` + `badge`.

**Revocation and reissue are done in the issuer admin**, not here. Calling the function again for the same
completion returns a new token with the same `sub`.

The button only appears when all badge secrets are set; otherwise the function answers
`503 badges_not_configured` and the completion screen shows no badge.

### Contract v1 (compact JWS, EdDSA / Ed25519)

Header: `{"alg":"EdDSA","typ":"JWT","kid":"<BADGE_TOKEN_KID>"}`

| Claim | Value |
|---|---|
| `iss` | `BADGE_CLIENT_ID` (`card-tree-testing`) |
| `aud` | `sac-ieee-colombia-badges` |
| `sub` | `base64url(HMAC-SHA256(BADGE_SUB_HMAC_KEY, "completion:v1:" + participant_id))`, 43 chars, stable per participant + study, no PII |
| `badge` | `BADGE_SLUG` (`test-participant`) |
| `jti` | random UUID per token |
| `iat`, `exp` | `exp = iat + 30 days` (the issuer rejects longer) |
| `evidence` | fixed non-PII text (under 200 chars) |

Endpoint: `POST <SUPABASE_URL>/functions/v1/completion-token`, body `{"participant_id": "<uuid>"}`.
Responses: `200 {claim_url}`, `400 invalid_participant_id`, `404 not_completed`, `503 badges_not_configured`,
`500 internal_error`. Deployed with `verify_jwt = false` (`supabase/config.toml`): the random participant id,
which the public key can never read, is the bearer secret.

Code: `supabase/functions/completion-token/` (`token.ts` is runtime-neutral and unit tested in Node).

### Keys and secrets (one time)

```sh
npm run badge:keygen                                   # writes .secrets/badge.env (git-ignored), prints the PUBLIC JWK
# edit BADGE_CLAIM_BASE_URL in .secrets/badge.env (issuer GitHub Pages URL)
npx supabase secrets set --env-file .secrets/badge.env
```

| Secret | Purpose |
|---|---|
| `BADGE_TOKEN_PRIVATE_JWK` | Ed25519 private key that signs tokens. Never leaves Supabase secrets and `.secrets/` |
| `BADGE_TOKEN_KID` | key id, registered in the issuer with the public JWK |
| `BADGE_SUB_HMAC_KEY` | derives `sub`; changing it changes every `sub` (the issuer would see new people) |
| `BADGE_CLIENT_ID` | `card-tree-testing` |
| `BADGE_SLUG` | `test-participant` |
| `BADGE_CLAIM_BASE_URL` | issuer Pages URL |

Send only the **public** JWK printed by the script to the issuer maintainer (`claim_clients` table).
Keep a backup of `.secrets/badge.env` in a password manager. To rotate: move the file away, run the script again,
register the new public key in the issuer, then `secrets set`. Unused tokens signed with the old key stop working
once the issuer removes that key.

## Export results to CSV

Run locally with the service role (secret) key. Never commit it or paste it in a workflow.

```sh
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_KEY=<secret> npm run export
```

Writes `export/card_sort.csv` and `export/tree_test.csv` (UTF-8 with BOM for Excel), with the profile columns on
every row. Cells starting with `=`, `+`, `-` or `@` are prefixed with `'` so spreadsheets do not run them as formulas.

## Study files

One file per study in `public/studies/`. The file name is the study id (letters, digits, `-`, `_`), and the
participant link is `https://<user>.github.io/<repo>/#/s/<study-id>`. The app tries `<id>.json`, then `<id>.csv`.
A broken file shows the exact validation error on that link.

### JSON

```json
{ "kind": "card_sort", "title": "…", "intro": "Optional, one paragraph per line",
  "consent": "Optional, replaces the default consent text",
  "cards": [{ "id": "c1", "label": "Becas y premios" }] }
```

```json
{ "kind": "tree_test", "title": "…", "intro": "…", "hesitation_ms": 10000,
  "tree": [{ "id": "mem", "label": "Membresía", "children": [{ "id": "mem-ren", "label": "Renovar" }] }],
  "tasks": [{ "id": "t1", "text": "¿Dónde renovarías tu membresía?", "correct": ["mem-ren"] }] }
```

### Split link (A/B test)

One shared link that sends each participant to one of several studies at random (equal chance per browser,
not balanced). The choice is remembered in that browser, so a reload never shows the other variant.
The stored `study_id` is the variant, so results can be compared directly.

```json
{ "kind": "split", "variants": ["arbol-a", "arbol-b"] }
```

Give both variants the same title and intro so participants cannot tell which one they got. To try a specific
variant yourself, open its own link (`#/s/arbol-a`), or the split link in a private window to draw again.

### CSV

Columns `type,id,parent,text,correct` (`,` or `;` separator; "CSV UTF-8" from Excel works).

| type | id | parent | text | correct |
|---|---|---|---|---|
| `title` | | | Study title | |
| `intro` | | | Intro text | |
| `consent` | | | Consent text (optional) | |
| `hesitation_ms` | | | `10000` (tree test, optional) | |
| `card` | card id | | Card label | |
| `node` | node id | parent node id, empty for top level | Node label | |
| `task` | task id | | Task text | correct node ids separated by `\|` |

A file with `card` rows is a card sort; with `node` rows, a tree test.

Limits (enforced on load so answers are never rejected on submit): ids 100 chars, labels 300, task text 1000.

## Current studies

Built from the wiki's `mkdocs.yml` and `VALIDACION.md` (IEEEStudentsHandbook repo), 2026-11-19.

| Link | File | What |
|---|---|---|
| `#/s/tarjetas-wiki` | `tarjetas-wiki.json` | Open card sort, 35 cards: every content page of the new structure plus "¿Qué es IEEE?" (card id = page path) |
| `#/s/arbol-wiki` | `arbol-wiki.json` | Split link: half go to `arbol-a`, half to `arbol-b` |
| (variant) | `arbol-a.csv` | **New** navigation (wiki commits 6624dcb, e6495b0): 44 nodes, 10 sections |
| (variant) | `arbol-b.csv` | **Old** navigation (baseline, wiki commit 8fd2d80): 34 nodes, 4 sections |

Both trees share the same 13 tasks, numbered as in `VALIDACION.md` (`t01` to `t14`). Task 9 ("create an Affinity
Group") is left out because the old tree has no correct answer for it, which would bias the comparison.
Section nodes count as answers because in the wiki each section is its own overview page. The wiki's home page
("Inicio") is not a node. Targets from `VALIDACION.md`: at least 80% success and 60% direct (no backtracking).

Recruit separate people for the card sort and the tree test: seeing the card labels first would prime the tree
test in favor of the new structure.

## Recorded data

- **Card sort** (`card_sort_placements`): one row per card with the participant's group name.
  Card and task order are shuffled per participant.
- **Tree test** (`tree_test_results`): one row per task.
  - `path`: every node visited in order, including parents revisited with "Volver" (`Inicio` at the top level).
  - `backtracked` / `backtrack_count`: pressed "Volver" at least once / how many times.
  - `hesitated`: time to first click was strictly greater than `hesitation_ms` (default 10 s).
  - `correct`: the chosen node is one of the task's `correct` ids.
