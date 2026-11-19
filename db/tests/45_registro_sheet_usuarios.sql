-- R-71: mientras el sheet sea la fuente, lo que viene de él no se registra desde la app.
-- R-83: usuarios administrados por el Administrador, estado calculado, siempre un Administrador activo.
update config set datos_desde_sheet = true;
insert into usuario (id, email, rol) values
  ('00000000-0000-0000-0000-0000000000e1', 'admin@manya.pe', 'admin'),
  ('00000000-0000-0000-0000-0000000000e2', 'tesoreria@manya.pe', 'tesoreria'),
  ('00000000-0000-0000-0000-0000000000e3', 'ceo@manya.pe', 'ceo');
insert into auth.users (id, email, invited_at, email_confirmed_at, last_sign_in_at) values
  ('00000000-0000-0000-0000-0000000000e1', 'admin@manya.pe', '2026-10-01', '2026-10-01', '2026-11-01'),
  ('00000000-0000-0000-0000-0000000000e2', 'tesoreria@manya.pe', '2026-11-12', null, null);

-- Cada columna de la lista existe en su tabla y cada tabla es del sheet
do $$
declare t text; c text;
begin
  for t, c in select k, jsonb_array_elements_text(v) from jsonb_each(registro_en_erp() -> 'columnas') x(k, v) loop
    assert t = any(tablas_carga()), format('R-71 %s no viene del sheet', t);
    assert exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = c),
      format('R-71 columna inexistente %s.%s', t, c);
  end loop;
end $$;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2"}', false);
do $$
declare n int;
begin
  -- lo del sheet se rechaza
  begin
    insert into pago (cuota_id, fecha, cuenta_id, monto, tc) select id, '2026-03-01', 1, 10, 1 from cuota limit 1;
    raise exception 'R-71 debió rechazar el pago';
  exception when others then assert sqlerrm like 'R-71: esto (pago)%', sqlerrm;
  end;
  begin
    update venta set anulado_motivo = 'x';
    raise exception 'R-71 debió rechazar el cambio de la venta';
  exception when others then assert sqlerrm like 'R-71: esto (venta)%', sqlerrm;
  end;
  begin
    update cliente set razon_social = 'Otro nombre' where id = '00000000-0000-0000-0000-0000000000c1';
    raise exception 'R-71 debió rechazar la razón social';
  exception when others then assert sqlerrm like 'R-71%', sqlerrm;
  end;
  -- lo que vive en el ERP sí se registra
  update cliente set ruc = '20123456789', correo_facturacion = 'pagos@uno.pe' where id = '00000000-0000-0000-0000-0000000000c1';
  get diagnostics n = row_count;
  assert n = 1, 'R-71 datos fiscales del cliente';
  update comprobante set autodetraccion_operacion = 'OP-1' where id = '00000000-0000-0000-0000-0000000000f1';
  get diagnostics n = row_count;
  assert n = 1, 'R-71 autodetracción';
  insert into marca (cliente_id, nombre) values ('00000000-0000-0000-0000-0000000000c1', 'Marca nueva');
  -- la app sabe qué viene del sheet
  assert (select count(*) from v_origen_sheet) = cardinality(tablas_carga()), 'R-71 v_origen_sheet';
  assert (select not alta_en_erp from v_origen_sheet where tabla = 'pago'), 'R-71 pago no se da de alta';
  assert (select alta_en_erp from v_origen_sheet where tabla = 'marca'), 'R-71 marca sí';
  -- R-83: tesorería no ve ni cambia usuarios
  assert (select count(*) from listar_usuarios()) = 0, 'R-83 tesorería no lista usuarios';
  update usuario set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000e2';
  get diagnostics n = row_count;
  assert n = 0, 'R-83 tesorería no cambia roles';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1"}', false);
do $$
begin
  update cuenta_bancaria set numero = '193-1', cci = '002193' where nombre = 'BCP USD';
  begin
    update cuenta_bancaria set nombre = 'BCP dólares' where nombre = 'BCP USD';
    raise exception 'R-71 debió rechazar el nombre de la cuenta';
  exception when others then assert sqlerrm like 'R-71%', sqlerrm;
  end;
  insert into tipo_cambio_mensual (periodo, tc, fuente) values ('2027-01-01', 3.5, 'manual');
  -- R-70: con el sheet como fuente no se cierran meses (la carga siguiente fallaría)
  begin
    insert into cierre_mensual (periodo) values ('2026-01-01');
    raise exception 'R-70 debió rechazar el cierre';
  exception when others then assert sqlerrm like 'R-70: mientras el sheet%', sqlerrm;
  end;

  -- R-83: estados calculados
  update usuario set activo = false where id = '00000000-0000-0000-0000-0000000000e3';
  assert (select estado from listar_usuarios() where email = 'admin@manya.pe') = 'activo', 'R-83 activo';
  assert (select estado from listar_usuarios() where email = 'tesoreria@manya.pe') = 'invitado', 'R-83 invitado';
  assert (select estado from listar_usuarios() where email = 'ceo@manya.pe') = 'desactivado', 'R-83 desactivado';
  -- siempre queda un Administrador activo
  begin
    update usuario set rol = 'tesoreria' where id = '00000000-0000-0000-0000-0000000000e1';
    raise exception 'R-83 debió exigir un Administrador';
  exception when others then assert sqlerrm like 'R-83%', sqlerrm;
  end;
  update usuario set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000e2';
  update usuario set rol = 'tesoreria' where id = '00000000-0000-0000-0000-0000000000e1';
end $$;
reset role;

-- cuando el ERP pase a ser la fuente, no queda nada bloqueado
update config set datos_desde_sheet = false;
do $$ begin assert (select count(*) from v_origen_sheet) = 0, 'R-71 sin sheet no hay bloqueo'; end $$;
