-- Datos sintéticos mínimos para probar reglas. Se cargan una vez en la base de pruebas.
insert into empresa (nombre) values ('Templates'), ('Manya Media');
insert into linea_negocio (nombre) values ('Performance'), ('Proyectos'), ('Inbound');
insert into categoria (nombre, linea_id) values ('Performance', 1), ('UX/UI', 2), ('Gestión de medios', 1);
insert into servicio (categoria_id, nombre, modalidad, naturaleza) values
  (1, 'Plan Mensual', 'mensual', 'propio'),
  (2, 'Sitio web', 'proyecto', 'propio'),
  (3, 'Pauta', 'mensual', 'terceros');
insert into persona (nombre) values ('Partner Uno'), ('Analista Uno'), ('Director Uno'), ('Admin Uno');
insert into equipo (nombre) values ('Team A');
insert into cuenta_bancaria (nombre, empresa_id, moneda, es_detraccion) values
  ('BCP USD', 1, 'USD', false), ('BCP Soles', 1, 'PEN', false), ('BN', 1, 'PEN', true);
insert into tipo_cambio_mensual values ('2026-01-01', 3.75), ('2026-03-01', 3.50);
insert into sub_area (nombre, grupo, linea_id) values
  ('Performance', 'directo', 1), ('Dirección', 'direccion', null), ('Administracion', 'overhead', null);
insert into peso_direccion values (1, 0.5), (2, 0.4), (3, 0.1);

insert into cliente (id, razon_social) values ('00000000-0000-0000-0000-0000000000c1', 'Cliente Uno SAC'),
                                              ('00000000-0000-0000-0000-0000000000c2', 'Cliente Dos SAC');
insert into servicio_contratado (id, cliente_id, servicio_id) values
  ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-0000000000c1', 1),
  ('00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-0000000000c1', 2),
  ('00000000-0000-0000-0000-00000000a003', '00000000-0000-0000-0000-0000000000c1', 3),
  ('00000000-0000-0000-0000-00000000a004', '00000000-0000-0000-0000-0000000000c2', 1);

-- Plan mensual de enero (USD 1000) · proyecto ene-abr (USD 4000) · pauta (USD 500) · cliente 2 en PEN
insert into venta (id, servicio_contratado_id, fecha_contrato, fecha_fin, monto_neto, pct_igv, moneda,
                   equipo_id, partner_id, pct_comision) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000a001', '2026-01-10', '2026-02-10', 1000, 0.18, 'USD', 1, 1, 0.05),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000a002', '2026-01-15', '2026-04-20', 4000, 0.18, 'USD', null, null, 0),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000a003', '2026-01-10', '2026-02-10', 500, 0.18, 'USD', null, null, 0),
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-00000000a004', '2026-03-05', '2026-04-05', 3500, 0.18, 'PEN', null, null, 0);

insert into comprobante (id, empresa_id, tipo, serie_numero, fecha_emision, fecha_limite, pct_detraccion) values
  ('00000000-0000-0000-0000-0000000000f1', 1, 'factura', 'E001-1', '2026-01-12', '2026-01-31', 0.12);
insert into cuota (id, venta_id, orden, concepto, monto_neto, fecha_limite, comprobante_id) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 1, '100% al inicio', 1000, '2026-01-20',
   '00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a2', 1, '50% inicial', 2000, '2026-01-20', null),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000a2', 2, '50% final', 1500, '2026-04-20', null);

insert into planilla (periodo, persona_id, sub_area_id, moneda, costo_total) values
  ('2026-01-01', 2, 1, 'PEN', 3750),   -- 1000 USD directo Performance
  ('2026-01-01', 3, 2, 'PEN', 1875),   --  500 USD Dirección (50/40/10)
  ('2026-01-01', 4, 3, 'PEN', 750);    --  200 USD overhead
insert into herramienta_gasto (periodo, nombre, moneda, monto) values ('2026-01-01', 'SaaS', 'USD', 100);
