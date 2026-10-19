-- R-70, R-80, R-81, R-82
insert into usuario (id, email, rol) values
  ('00000000-0000-0000-0000-0000000000e1', 'admin@manya.pe', 'admin'),
  ('00000000-0000-0000-0000-0000000000e2', 'tesoreria@manya.pe', 'tesoreria'),
  ('00000000-0000-0000-0000-0000000000e3', 'ceo@manya.pe', 'ceo');

-- R-80: CEO no ve tablas operativas, pero sí KPIs
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e3"}', false);
do $$
declare n int;
begin
  select count(*) into n from venta;
  assert n = 0, format('R-80 CEO no debe leer ventas (%s)', n);
  select count(*) into n from v_kpi_mes;
  assert n > 0, 'R-80 CEO debe leer KPIs';
  begin
    insert into cliente (razon_social) values ('No permitido');
    raise exception 'R-80 CEO no debe crear clientes';
  exception when insufficient_privilege then null;
  end;
end $$;

-- R-80: tesorería registra operaciones pero no edita catálogos
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2"}', false);
do $$
declare n int;
begin
  select count(*) into n from venta;
  assert n > 0, 'R-80 tesorería lee ventas';
  insert into cliente (razon_social) values ('Cliente Tres SAC');
  update servicio set nombre = 'X' where id = 1;
  get diagnostics n = row_count;
  assert n = 0, 'R-80 tesorería no edita catálogos';
  -- R-81: nadie borra registros operativos
  begin
    delete from cliente where razon_social = 'Cliente Tres SAC';
    raise exception 'R-81 no se debe poder borrar';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from v_kpi_mes;
  assert n > 0, 'R-80 tesorería lee KPIs';
end $$;

-- R-82: el alta quedó en la bitácora con su usuario
reset role;
do $$
begin
  assert exists (select 1 from auditoria where tabla = 'cliente' and accion = 'INSERT'
                 and usuario_id = '00000000-0000-0000-0000-0000000000e2'), 'R-82 bitácora';
end $$;

-- R-70: mes cerrado no se modifica
insert into cierre_mensual (periodo) values ('2026-01-01');
do $$
begin
  update venta set monto_neto = 1 where id = '00000000-0000-0000-0000-0000000000a1';
  raise exception 'R-70 debió bloquear';
exception when others then
  assert sqlerrm like 'R-70%', sqlerrm;
end $$;
do $$
begin
  insert into cierre_mensual (periodo) values ('2026-02-01');
  raise exception 'R-70 debió exigir TC';
exception when others then
  assert sqlerrm like 'R-70%', sqlerrm;
end $$;
