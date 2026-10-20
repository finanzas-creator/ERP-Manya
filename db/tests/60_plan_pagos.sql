-- R-13, R-14
insert into usuario (id, email, rol) values
  ('00000000-0000-0000-0000-0000000000e1', 'admin@manya.pe', 'admin'),
  ('00000000-0000-0000-0000-0000000000e2', 'tesoreria@manya.pe', 'tesoreria');

-- R-14 / R-10: agregar cuota sin monto cubre lo que falta planificar (proyecto: 4000 - 3500)
do $$
declare q uuid; r record;
begin
  q := agregar_cuota('00000000-0000-0000-0000-0000000000a2', 'Saldo');
  select orden, monto_neto into r from cuota where id = q;
  assert r.orden = 3 and r.monto_neto = 500, format('R-14 agregar: %s', r);
  assert (select estado_plan from v_venta where id = '00000000-0000-0000-0000-0000000000a2') = 'cuadra', 'R-10 cuadra';
end $$;

-- R-14: cuota con pagos no se anula
insert into pago (cuota_id, fecha, cuenta_id, monto, tc) values ('00000000-0000-0000-0000-0000000000b2', '2026-01-20', 1, 100, 1);
do $$
begin
  perform anular('cuota', '00000000-0000-0000-0000-0000000000b2', 'prueba');
  raise exception 'R-14 debió impedir anular';
exception when others then assert sqlerrm like 'R-14%', sqlerrm;
end $$;

-- R-13: tesorería no cambia el monto de una cuota facturada; el administrador sí
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2"}', false);
do $$
begin
  update cuota set monto_neto = 900 where id = '00000000-0000-0000-0000-0000000000b1';
  raise exception 'R-13 debió impedir a tesorería';
exception when others then assert sqlerrm like 'R-13%', sqlerrm;
end $$;
do $$
begin   -- una cuota sin facturar sí la edita tesorería
  update cuota set monto_neto = 2100 where id = '00000000-0000-0000-0000-0000000000b2';
  assert (select monto_neto from cuota where id = '00000000-0000-0000-0000-0000000000b2') = 2100, 'R-13 sin facturar';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1"}', false);
do $$
begin
  update cuota set monto_neto = 900 where id = '00000000-0000-0000-0000-0000000000b1';
  assert (select monto_neto from cuota where id = '00000000-0000-0000-0000-0000000000b1') = 900, 'R-13 admin corrige';
end $$;
reset role;
