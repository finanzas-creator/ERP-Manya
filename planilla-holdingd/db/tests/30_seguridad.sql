-- R-26: sin sesión (anon) no se ve ni se ejecuta nada
set role anon;
do $$
begin
  begin perform 1 from trabajador limit 1; raise exception 'anon leyó trabajador';
  exception when insufficient_privilege then null; end;
  begin perform 1 from v_planilla limit 1; raise exception 'anon leyó v_planilla';
  exception when insufficient_privilege then null; end;
  begin perform legal('rmv', current_date); raise exception 'anon ejecutó legal()';
  exception when insufficient_privilege then null; end;
  begin perform integrar_trabajadores('20000000000', '[]'); raise exception 'anon ejecutó la integración';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
