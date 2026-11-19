# Card sorting y tree testing (IEEE)

Aplicación web estática (GitHub Pages) que recoge datos de card sorting abierto y tree testing en Supabase (plan
gratuito). La interfaz para participantes está en español y pensada para celular. Los participantes solo pueden
**insertar** datos; nadie puede leerlos sin la llave secreta (service role).

Flujo del participante: introducción + consentimiento → perfil (cargo actual en IEEE, años en IEEE, grado de
membresía, experiencia como directivo, uso previo de la wiki) → actividad → fin (con reintento si falla la red).
Las respuestas se guardan a medida que avanza, para poder medir el abandono.

- Para publicar un estudio nuevo: [docs/new-study.md](docs/new-study.md).
- Cómo se calcula cada métrica del panel: [docs/metricas.md](docs/metricas.md).
- Formato de los archivos de estudio: [Archivos de estudio](#archivos-de-estudio).

## Contenido

- [Privacidad y consentimiento](#privacidad-y-consentimiento)
- [Despliegue](#despliegue)
- [Modificar la aplicación](#modificar-la-aplicación)
- [Pruebas](#pruebas)
- [Operación: keepalive y pausa](#operación-keepalive-y-pausa)
- [Insignias (open-badges-ieee)](#insignias-open-badges-ieee)
- [Exportar a CSV](#exportar-a-csv)
- [Panel de análisis](#panel-de-análisis)
- [Archivos de estudio](#archivos-de-estudio)
- [Estudios actuales](#estudios-actuales)
- [Datos registrados](#datos-registrados)

## Privacidad y consentimiento

**Se guarda** (después de aceptar el consentimiento, a medida que el participante avanza):

| Dato | Para qué |
|---|---|
| Cargo actual en IEEE, grado de membresía (listas fijas) | Separar resultados por público (grupos de VALIDACION.md) |
| Años en IEEE, si es o ha sido directivo | Nivel de experiencia |
| Si había usado la wiki (nunca / una o dos veces / varias veces) | La familiaridad con la estructura anterior sesga el A/B del árbol |
| Grupos de tarjetas, tarjetas no entendidas y su suposición opcional; navegación del árbol, tiempos, "no sé", tareas omitidas y confianza | El estudio en sí |
| UUID aleatorio del participante, fechas, marca de fin | Unir las filas de un participante y medir abandono; sin relación con su identidad |

**No se guarda**: nombre, correo, dirección IP, navegador, ubicación, cookies ni almacenamiento del navegador para
datos del estudio (`persistSession: false`, sin analítica, sin scripts de terceros). La única excepción es
`localStorage` para recordar qué variante de un enlace A/B le tocó a ese navegador.

Fuera del control de la aplicación, conviene declararlo ante un comité de ética:

- Supabase y GitHub Pages guardan sus propios registros de peticiones (con IP) por un tiempo limitado.
- Insignias (opcional, ver [Insignias](#insignias-open-badges-ieee)): el emisor recibe un `sub` seudónimo y luego
  pide nombre y correo en su propia página. Este proyecto no guarda nada nuevo. Quien tenga a la vez
  `BADGE_SUB_HMAC_KEY` y la base de datos del emisor puede unir un nombre con las respuestas de un participante:
  guarda esa llave solo en los secretos de Supabase y nunca la exportes junto con datos del emisor.
- Los campos del perfil son cuasi identificadores: informa resultados agregados y no publiques filas por participante.

El consentimiento se muestra antes que todo y se acepta con una casilla. El texto por defecto es `DEFAULT_CONSENT`
en `src/study.ts`; cada estudio puede reemplazarlo con un campo `consent`. **Si cambias lo que se recoge o cuándo
se guarda, actualiza ese texto en el mismo cambio.**

## Despliegue

### Configuración inicial (una vez)

1. **Supabase**: crea un proyecto en el plan gratuito. Anota el *project ref* (está en la URL), la *contraseña de
   la base de datos* y, en Project Settings → API keys, la llave *anon/publishable* y la *service role/secret*.
2. **Token de acceso de Supabase**: créalo en <https://supabase.com/dashboard/account/tokens>.
3. **Repositorio en GitHub → Settings → Pages**: Source = **GitHub Actions**.
4. **Repositorio en GitHub → Settings → Secrets and variables → Actions**:

   | Tipo | Nombre | Valor |
   |---|---|---|
   | Secret | `SUPABASE_ACCESS_TOKEN` | token del paso 2 |
   | Secret | `SUPABASE_DB_PASSWORD` | contraseña de la base de datos |
   | Variable | `SUPABASE_PROJECT_REF` | project ref |
   | Variable | `SUPABASE_URL` | `https://<ref>.supabase.co` |
   | Variable | `SUPABASE_ANON_KEY` | llave anon o publishable (pública por diseño) |

   La llave secreta (service role) **nunca** se guarda en GitHub; solo se usa en tu computador para exportar y
   generar el panel.

5. Haz push a `main`.

### Qué hace el workflow (`.github/workflows/ci.yml`)

| Job | Cuándo | Qué hace |
|---|---|---|
| `test` | cada push y PR | verificación de tipos + pruebas unitarias |
| `test-db` | cada push y PR | levanta Supabase en Docker, corre las pruebas pgTAP de RLS y las pruebas de API con las llaves públicas |
| `migrate` | push a `main`, si pasan las pruebas | `supabase link` + `supabase db push --remote --yes` (aplica solo migraciones nuevas) + `supabase functions deploy completion-token --yes` |
| `deploy` | después de `migrate` | construye con la URL y la llave públicas y publica en GitHub Pages |

Si una prueba falla, no se migra ni se despliega. Se puede volver a correr a mano desde la pestaña Actions.

### Aplicar una migración a mano con la CLI de Supabase

La CLI es una dependencia de desarrollo, así que `npx supabase` usa la versión fijada. Con la CLI v3, `--remote`
apunta al proyecto enlazado (sin él, apunta a la base local) y `--yes` confirma cambios en el proyecto alojado.

```sh
npx supabase login
npx supabase link --project-ref <ref>
npx supabase migration list --remote          # qué migraciones están aplicadas
npx supabase db push --remote --dry-run       # qué se aplicaría, sin cambiar nada
npx supabase db push --remote                 # aplica las migraciones pendientes
npx supabase functions deploy completion-token
```

Lo normal es no hacerlo a mano: al hacer push a `main`, el workflow aplica las migraciones pendientes, despliega
la función y publica el sitio, en ese orden.

### Esta versión: "no sé", omitidas y guardado progresivo

La migración `20261119050000_dont_know_and_progress.sql` es compatible hacia atrás: solo agrega columnas (con valor
por defecto o nulas), relaja restricciones y crea la tabla `completions`, con la que marca como terminados a
quienes ya tenían resultados. Las respuestas guardadas antes se leen como "sin marca de no sé" y su resultado se
deriva de `correct`. El orden del workflow (migración antes que el sitio) evita que el sitio nuevo escriba
columnas que aún no existen.

## Modificar la aplicación

| Para cambiar… | Edita | Luego |
|---|---|---|
| Textos de la interfaz (y el enlace a la wiki de la pantalla final, `WIKI_URL`) | `src/main.ts`, `src/cardsort.ts`, `src/treetest.ts` | `npm run dev` y revisa en una ventana del tamaño de un celular |
| Texto de consentimiento por defecto | `DEFAULT_CONSENT` en `src/study.ts` | que siga diciendo la verdad sobre lo que se guarda |
| Cómo se califica cada respuesta | `src/metrics.ts` | actualiza `src/metrics.test.ts` |
| Métricas del panel | `src/analysis.ts` y `scripts/report-template.html` | actualiza `src/analysis.test.ts` y `docs/metricas.md` |
| Formato de los archivos de estudio | `src/study.ts` | actualiza `src/study.test.ts`, este README y `docs/new-study.md` |
| Esquema de la base de datos | migración nueva (abajo) | actualiza `supabase/tests/rls.test.sql`, `tests/rls-api.test.ts` y las vistas de exportación |
| Campos del perfil | migración + `profileForm` en `src/main.ts` + `DEFAULT_CONSENT` | pregúntate si el campo es realmente necesario |
| Estilos | `src/style.css` (colores como variables en `:root`, copiados de la wiki) | |

### Cambios de esquema

Nunca edites una migración ya aplicada; crea una nueva:

```sh
npx supabase migration new agregar_algo   # crea supabase/migrations/<fecha>_agregar_algo.sql
npx supabase db reset                     # reconstruye la base local con todas las migraciones
npm run test:db                           # pruebas pgTAP
```

Cada tabla nueva debe: `enable row level security`, `revoke all … from anon, authenticated`, dar solo el permiso
necesario y tener una prueba de que no se puede leer, en `supabase/tests/rls.test.sql` y en `tests/rls-api.test.ts`.
Para las vistas de exportación, agrega columnas nuevas **al final** (`create or replace view`), así el CSV conserva
el orden de las existentes. Hacer merge a `main` la aplica en producción.

## Pruebas

| Comando | Necesita | Cubre |
|---|---|---|
| `npm test` | Node 24+ | archivos de estudio, calificación de respuestas (`metrics.ts`), métricas del panel (`analysis.ts`, con casos límite), CSV, token de insignias |
| `npm run test:db` | Docker, `npx supabase start` | RLS en SQL: anon inserta y nunca lee, actualiza ni borra (también las columnas nuevas y `completions`); restricciones |
| `npm run test:api` | Docker, stack local + servidor de funciones + variables de abajo | RLS a través de la API real con las llaves anon y publishable (incluye GraphQL y columnas nuevas); `completion-token` de punta a punta |

```sh
npx supabase start
npm run badge:keygen   # solo si .secrets/badge.env no existe todavía
npx supabase functions serve --env-file .secrets/badge.env &
eval "$(npx supabase status -o env | grep -E '^(API_URL|ANON_KEY|PUBLISHABLE_KEY)=')"
export API_URL ANON_KEY PUBLISHABLE_KEY
set -a; . .secrets/badge.env; set +a
npm run test:api
```

La prueba de GraphQL aparece como *omitida* si `pg_graphql` no está activo en local; el CI lo activa.

## Operación: keepalive y pausa

Los proyectos gratuitos de Supabase se pausan tras 7 días de poca actividad (según su documentación, unas pocas
peticiones diarias lo evitan). `.github/workflows/keepalive.yml` corre a diario y llama a `public.ping()`, una
función que solo devuelve la hora del servidor, con la llave pública. Si falla, el workflow falla y GitHub le
envía un correo al dueño del repositorio.

Para correrlo a mano: Actions → *Keep Supabase awake* → *Run workflow*, o `gh workflow run keepalive.yml`.

**GitHub desactiva los workflows programados de un repositorio público tras 60 días sin actividad en el repositorio.**
La pestaña Actions muestra un aviso en el workflow. Reactívalo con *Enable workflow* o
`gh workflow enable keepalive.yml`; cualquier push también cuenta como actividad.

### Si el proyecto se pausó de todos modos

1. Panel de Supabase → la organización → el proyecto pausado → **Resume project**, y confirma.
   Vuelve con sus datos y su configuración. La documentación da hasta un año para restaurarlo.
2. Revisa que el keepalive esté activo (arriba) y córrelo una vez a mano.
3. Abre un enlace de estudio y confirma que carga; las respuestas guardadas antes de la pausa siguen ahí.

## Insignias (open-badges-ieee)

Quien termina un estudio puede reclamar la insignia `test-participant` del proyecto emisor, que es independiente
(`open-badges-ieee`). La integración es solo por API: no comparten código ni base de datos.

### Flujo

1. El participante termina; la aplicación guarda la marca de fin en `completions`.
2. El navegador llama a la Edge Function `completion-token` con `{"participant_id": "<uuid>"}`.
3. La función verifica **en la base de datos, con la llave secreta**, que ese participante tenga la marca de fin.
   Si no existe o no terminó (aunque haya guardado algunas respuestas), responde `404 {"error":"not_completed"}`.
4. Devuelve `{"claim_url": "<BADGE_CLAIM_BASE_URL>/claim.html#token=<jws>"}`; la pantalla final muestra
   "Reclamar mi insignia". El token va en el fragmento de la URL, así que nunca llega a un registro de servidor.
5. En la página del emisor, la persona escribe nombre y correo; el emisor verifica el token con nuestra llave
   **pública** y emite la insignia, sin duplicar por `sub` + `badge`.

**La revocación y la reemisión se hacen en el panel del emisor**, no aquí. Llamar otra vez a la función para la
misma participación devuelve un token nuevo con el mismo `sub`.

El botón aparece solo cuando todos los secretos de insignias están configurados; si no, la función responde
`503 badges_not_configured` y la pantalla final no muestra insignia.

### Contrato v1 (JWS compacto, EdDSA / Ed25519)

Encabezado: `{"alg":"EdDSA","typ":"JWT","kid":"<BADGE_TOKEN_KID>"}`

| Claim | Valor |
|---|---|
| `iss` | `BADGE_CLIENT_ID` (`card-tree-testing`) |
| `aud` | `sac-ieee-colombia-badges` |
| `sub` | `base64url(HMAC-SHA256(BADGE_SUB_HMAC_KEY, "completion:v1:" + participant_id))`, 43 caracteres, estable por participante + estudio, sin datos personales |
| `badge` | `BADGE_SLUG` (`test-participant`) |
| `jti` | UUID aleatorio por token |
| `iat`, `exp` | `exp = iat + 30 días` (el emisor rechaza más) |
| `evidence` | texto fijo sin datos personales (menos de 200 caracteres) |

Endpoint: `POST <SUPABASE_URL>/functions/v1/completion-token`, cuerpo `{"participant_id": "<uuid>"}`.
Respuestas: `200 {claim_url}`, `400 invalid_participant_id`, `404 not_completed`, `503 badges_not_configured`,
`500 internal_error`. Se despliega con `verify_jwt = false` (`supabase/config.toml`): el id aleatorio del
participante, que la llave pública nunca puede leer, funciona como secreto.

Código: `supabase/functions/completion-token/` (`token.ts` no depende del entorno y se prueba en Node).

### Llaves y secretos (una vez)

```sh
npm run badge:keygen                                   # escribe .secrets/badge.env (ignorado por git) e imprime la llave PÚBLICA
# edita BADGE_CLAIM_BASE_URL en .secrets/badge.env (URL de Pages del emisor)
npx supabase secrets set --env-file .secrets/badge.env
```

| Secreto | Para qué |
|---|---|
| `BADGE_TOKEN_PRIVATE_JWK` | llave privada Ed25519 que firma los tokens. Nunca sale de los secretos de Supabase ni de `.secrets/` |
| `BADGE_TOKEN_KID` | id de la llave, registrado en el emisor junto con la llave pública |
| `BADGE_SUB_HMAC_KEY` | deriva el `sub`; cambiarla cambia todos los `sub` (el emisor vería personas nuevas) |
| `BADGE_CLIENT_ID` | `card-tree-testing` |
| `BADGE_SLUG` | `test-participant` |
| `BADGE_CLAIM_BASE_URL` | URL de Pages del emisor |

Envía al responsable del emisor solo la llave **pública** que imprime el script (tabla `claim_clients`).
Guarda una copia de `.secrets/badge.env` en un gestor de contraseñas. Para rotarla: mueve el archivo, corre el
script de nuevo, registra la nueva llave pública en el emisor y luego `secrets set`.

## Exportar a CSV

Se corre en tu computador con la llave secreta. Nunca la subas al repositorio ni la pegues en un workflow.

```sh
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_KEY=<secreta> npm run export
```

Escribe `export/card_sort.csv` y `export/tree_test.csv` (UTF-8 con BOM para Excel), con las columnas del perfil en
cada fila. Las columnas existentes conservan su orden y las nuevas van **al final**:

| Archivo | Columnas nuevas (al final) |
|---|---|
| `card_sort.csv` | `not_understood` (tarjeta no entendida), `guess` (texto opcional "¿Qué crees que significa?"; `group_name` va vacío en esas filas) |
| `tree_test.csv` | `outcome` (`success`, `failure`, `dont_know`, `skipped`), `confidence` (1-5 o vacío), `skipped` (tarea omitida) |

En las filas de "no sé" y "omitida", `correct`, `selected_node_id` y `selected_label` van vacíos: nunca cuentan como
éxito ni como error. Las tareas abandonadas no tienen fila; el panel las cuenta (ver `docs/metricas.md`).
Las celdas que empiezan con `=`, `+`, `-` o `@` llevan `'` delante para que una hoja de cálculo no las ejecute.

## Panel de análisis

```sh
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_KEY=<secreta> npm run report
```

Genera `export/report.html`: un solo archivo, sin conexión, que se abre en el navegador. Contiene los datos, así
que trátalo como el CSV (no lo publiques). Para ver datos nuevos, vuelve a generarlo. Incluye:

- **Filtro por perfil** (cargo, grado de membresía, experiencia como directivo, uso previo de la wiki, años en
  IEEE), aplicado a todas las métricas. Por ejemplo, "No soy miembro" frente a "Student Member".
- **Card sorting**: % de "No sé qué significa" por tarjeta, ranking de las más no entendidas con sus suposiciones,
  matriz de similitud y dendrograma (enlace promedio) sin las tarjetas no entendidas, con aviso de cuántas marcas
  se excluyeron.
- **Tree testing**: por tarea, por separado, éxito, éxito directo, fallo, "no sé", omitida y abandono, cada uno con
  su base explícita, y la confianza promedio.

Las fórmulas están en [docs/metricas.md](docs/metricas.md) y en `src/analysis.ts`.

## Archivos de estudio

Un archivo por estudio en `public/studies/`. El nombre del archivo es el id del estudio (letras, números, `-`, `_`),
y el enlace para participantes es `https://<usuario>.github.io/<repo>/#/s/<id>`. La aplicación busca `<id>.json` y
luego `<id>.csv`. Si un archivo tiene errores, el enlace muestra el error exacto.

### JSON

```json
{ "kind": "card_sort", "title": "…", "intro": "Opcional, un párrafo por línea",
  "consent": "Opcional, reemplaza el texto de consentimiento por defecto",
  "cards": [{ "id": "c1", "label": "Becas y premios" }] }
```

```json
{ "kind": "tree_test", "title": "…", "intro": "…", "hesitation_ms": 10000,
  "tree": [{ "id": "mem", "label": "Membresía", "children": [{ "id": "mem-ren", "label": "Renovar" }] }],
  "tasks": [{ "id": "t1", "text": "¿Dónde renovarías tu membresía?", "correct": ["mem-ren"] }] }
```

### Enlace A/B (split)

Un enlace compartido que manda a cada participante a uno de varios estudios al azar (misma probabilidad por
navegador, sin balancear). La elección queda recordada en ese navegador, así que al recargar nunca ve la otra
variante. El `study_id` guardado es la variante, así que los resultados se comparan directamente.

```json
{ "kind": "split", "variants": ["arbol-a", "arbol-b"] }
```

Usa el mismo título e introducción en ambas variantes para que no se note cuál le tocó. Para probar una variante
específica, abre su propio enlace (`#/s/arbol-a`), o el enlace A/B en una ventana privada para sortear de nuevo.

### CSV

Columnas `type,id,parent,text,correct` (separador `,` o `;`; sirve el "CSV UTF-8" de Excel).

| type | id | parent | text | correct |
|---|---|---|---|---|
| `title` | | | Título del estudio | |
| `intro` | | | Texto de introducción | |
| `consent` | | | Texto de consentimiento (opcional) | |
| `hesitation_ms` | | | `10000` (tree test, opcional) | |
| `card` | id de la tarjeta | | Texto de la tarjeta | |
| `node` | id del nodo | id del padre, vacío en el primer nivel | Texto del nodo | |
| `task` | id de la tarea | | Texto de la tarea | ids de los nodos correctos separados por `\|` |

Un archivo con filas `card` es un card sort; con filas `node`, un tree test.

Límites (se validan al cargar, para que ninguna respuesta se rechace al guardar): ids 100 caracteres, textos 300,
texto de tarea 1000.

## Estudios actuales

Construidos a partir de `mkdocs.yml` y `VALIDACION.md` de la wiki (repositorio IEEEStudentsHandbook), 2026-11-19.

| Enlace | Archivo | Qué es |
|---|---|---|
| `#/s/tarjetas-wiki` | `tarjetas-wiki.json` | Card sort abierto, 35 tarjetas: cada página de contenido de la estructura nueva más "¿Qué es IEEE?" (id de tarjeta = ruta de la página) |
| `#/s/arbol-wiki` | `arbol-wiki.json` | Enlace A/B: la mitad va a `arbol-a` y la otra mitad a `arbol-b` |
| (variante) | `arbol-a.csv` | Navegación **nueva** (commits de la wiki 6624dcb, e6495b0): 44 nodos, 10 secciones |
| (variante) | `arbol-b.csv` | Navegación **anterior** (línea base, commit 8fd2d80 de la wiki): 34 nodos, 4 secciones |

Ambos árboles comparten las mismas 13 tareas, numeradas como en `VALIDACION.md` (`t01` a `t14`). La tarea 9 ("crear
un Grupo de Afinidad") se dejó fuera porque el árbol anterior no tiene respuesta correcta y sesgaría la comparación.
Los nodos de sección cuentan como respuesta porque en la wiki cada sección es su propia página de resumen. La página
de inicio de la wiki no es un nodo. Metas de `VALIDACION.md`: al menos 80% de éxito y 60% de éxito directo.

Recluta personas distintas para el card sort y para el tree test: ver primero los textos de las tarjetas
predispone el tree test a favor de la estructura nueva.

## Datos registrados

- **Card sort** (`card_sort_placements`): una fila por tarjeta, con el nombre del grupo que le dio el participante.
  - `not_understood`: marcó "No sé qué significa". Esas filas no tienen grupo (`group_name` nulo).
  - `guess`: respuesta opcional a "¿Qué crees que significa?" (máximo 200 caracteres). No se muestra ninguna
    definición: una ayuda invalidaría la medición.
  - El orden de las tarjetas y de las tareas se mezcla para cada participante.
- **Tree test** (`tree_test_results`): una fila por tarea, guardada al terminarla.
  - `outcome`: `success` (eligió un nodo correcto), `failure` (eligió otro nodo), `dont_know` ("No sé dónde
    buscaría esto") o `skipped` ("Esta tarea no aplica a mi rol"). En filas anteriores a esta versión viene nulo
    y se deriva de `correct`.
  - `correct`: el nodo elegido es uno de los correctos. Nulo en `dont_know` y `skipped`.
  - `confidence`: confianza de 1 a 5, opcional, solo cuando eligió un nodo.
  - `path`: cada nodo visitado en orden, incluidos los padres a los que volvió con "Volver" (`Inicio` en el primer nivel).
  - `backtracked` / `backtrack_count`: usó "Volver" al menos una vez / cuántas veces.
  - `hesitated`: el tiempo hasta el primer clic fue mayor que `hesitation_ms` (10 s por defecto).
- **Marca de fin** (`completions`): una fila cuando el participante termina el estudio. Quien empezó y no la tiene
  abandonó; las tareas sin fila de esa persona cuentan como abandono.
