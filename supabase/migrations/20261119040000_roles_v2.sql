-- Roles v2: treasurer joins the Student Branch officers; "Otro" becomes "Voluntario" and "Ninguno" ("Sin cargo" merged into it).
-- NOT VALID keeps any rows saved with the old values instead of failing the migration.
-- Keep in sync with ROLES in src/main.ts.
alter table public.participants drop constraint participants_role_check;
alter table public.participants add constraint participants_role_check check (role in (
  'Directivo de Rama (presidente, vicepresidente, secretario o tesorero)',
  'Directivo de Capítulo o Grupo de Afinidad',
  'Consejero de Rama',
  'Voluntario',
  'Ninguno'
)) not valid;
