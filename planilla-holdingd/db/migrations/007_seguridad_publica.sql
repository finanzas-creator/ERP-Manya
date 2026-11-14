-- 007 · R-26: sin sesión no se ve ni se ejecuta nada. Supabase concede por defecto al rol anónimo
-- (anon) permisos sobre todo objeto nuevo del esquema public; aquí se retiran los actuales y los futuros.
-- Los usuarios con sesión (authenticated) siguen limitados por los permisos y políticas de cada tabla.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;
revoke execute on all functions in schema public from public;

-- Lo que la app y la integración llaman con sesión
grant execute on all functions in schema public to authenticated;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon, public;
