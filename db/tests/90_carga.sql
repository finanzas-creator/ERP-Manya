-- R-71: la recarga desde el sheet conserva lo que solo vive en el ERP y rechaza cargas incompletas

do $$
declare t text; r jsonb;
begin
  -- "el sheet": copia de los datos actuales en el esquema de carga
  perform preparar_carga();
  foreach t in array tablas_carga() loop
    execute format('insert into carga.%I overriding system value select * from public.%I', t, t);
  end loop;
  -- lo que se registra solo en el ERP
  update empresa set direccion_fiscal = 'Av. Uno 123' where id = 1;
  update cuenta_bancaria set numero = '193-1', cci = '002193' where nombre = 'BCP USD';
  update cliente set ruc = '20123456789', correo_facturacion = 'pagos@uno.pe' where id = '00000000-0000-0000-0000-0000000000c1';
  insert into gestion_cobranza (cliente_id, fecha, tipo_id, detalle) values ('00000000-0000-0000-0000-0000000000c1', '2026-02-01', 1, 'Llamada');
  update comprobante set autodetraccion_operacion = 'OP-9' where id = '00000000-0000-0000-0000-0000000000f1';
  insert into tipo_cambio_mensual (periodo, tc, fuente) values ('2026-04-01', 3.6, 'sunat');

  -- una carga con muchas menos ventas que hoy se rechaza y no cambia nada
  begin
    delete from carga.cuota; delete from carga.venta;
    perform aplicar_carga('incompleta');
    raise exception 'debió rechazar';
  exception when others then assert sqlerrm like 'R-71%', sqlerrm;
  end;
  assert (select count(*) from venta) = 4, 'R-71 una carga rechazada no toca nada';

  r := aplicar_carga('prueba');
  assert (r ->> 'venta')::int = 4, format('R-71 resumen: %s', r);
  assert (select direccion_fiscal from empresa where id = 1) = 'Av. Uno 123', 'R-71 datos fiscales de la empresa';
  assert (select cci from cuenta_bancaria where nombre = 'BCP USD') = '002193', 'R-71 N° de cuenta y CCI';
  assert (select ruc from cliente where id = '00000000-0000-0000-0000-0000000000c1') = '20123456789', 'R-71 RUC del cliente';
  assert (select count(*) from gestion_cobranza) = 1, 'R-71 gestiones de cobranza';
  assert (select autodetraccion_operacion from comprobante where id = '00000000-0000-0000-0000-0000000000f1') = 'OP-9', 'R-71 autodetracción';
  assert (select tc from tipo_cambio_mensual where periodo = '2026-04-01') = 3.6, 'R-71 TC que el sheet no tiene';
  assert to_regnamespace('carga') is null, 'R-71 el esquema de carga se borra';
  assert (select resultado from carga_sheet order by id desc limit 1) = 'ok', 'R-71 bitácora de cargas';
end $$;
