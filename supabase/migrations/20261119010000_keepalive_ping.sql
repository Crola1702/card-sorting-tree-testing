-- Successful, data-free query for the scheduled keepalive workflow (free projects pause after 7 idle days).
create function public.ping() returns timestamptz
language sql stable
as $$ select now() $$;

-- Supabase grants EXECUTE on new public functions to everyone by default; allow only the public key's role.
revoke all on function public.ping() from public, anon, authenticated;
grant execute on function public.ping() to anon;
