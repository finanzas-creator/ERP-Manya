-- 008 · Edición del plan de pagos (R-13, R-14).

-- R-13: lo ya facturado es un documento legal. El monto de una cuota facturada y el
-- % IGV / moneda de una venta con cuotas facturadas solo los corrige el administrador.
-- La carga del sistema (sin usuario autenticado) no está sujeta a esta regla.
create function edita_facturado_libre() returns boolean language sql stable as $$
  select auth.uid() is null or app_rol() = 'admin'
$$;

create function proteger_cuota_facturada() returns trigger language plpgsql as $$
begin
  if not edita_facturado_libre() and old.comprobante_id is not null
     and (new.monto_neto <> old.monto_neto or new.venta_id <> old.venta_id) then
    raise exception 'R-13: la cuota ya está facturada; solo el administrador puede cambiar su monto';
  end if;
  return new;
end $$;
create trigger cuota_facturada before update on cuota for each row execute function proteger_cuota_facturada();

create function proteger_venta_facturada() returns trigger language plpgsql as $$
begin
  if not edita_facturado_libre() and (new.pct_igv <> old.pct_igv or new.moneda <> old.moneda)
     and exists (select 1 from cuota where venta_id = new.id and comprobante_id is not null and anulado_en is null) then
    raise exception 'R-13: la venta tiene cuotas facturadas; solo el administrador puede cambiar su IGV o moneda';
  end if;
  return new;
end $$;
create trigger venta_facturada before update on venta for each row execute function proteger_venta_facturada();

-- R-14: una cuota con pagos vigentes no se anula (primero se anulan sus pagos).
create function chk_anular_cuota() returns trigger language plpgsql as $$
begin
  if new.anulado_en is not null and old.anulado_en is null
     and exists (select 1 from pago where cuota_id = new.id and anulado_en is null) then
    raise exception 'R-14: la cuota tiene pagos registrados; anula primero los pagos';
  end if;
  return new;
end $$;
create trigger cuota_anular before update of anulado_en on cuota for each row execute function chk_anular_cuota();

-- Agregar una cuota al final del plan; sin monto, cubre lo que falta planificar (R-10).
create function agregar_cuota(p_venta uuid, p_concepto text, p_fecha_limite date default null,
                              p_monto numeric default null) returns uuid language plpgsql as $$
declare qid uuid; falta numeric;
begin
  select falta_planificar into falta from v_venta where id = p_venta;
  if coalesce(p_monto, falta, 0) <= 0 then
    raise exception 'R-10: no hay monto por planificar; indica el monto de la cuota';
  end if;
  insert into cuota (venta_id, orden, concepto, monto_neto, fecha_limite)
  values (p_venta, coalesce((select max(orden) from cuota where venta_id = p_venta), 0) + 1,
          coalesce(nullif(trim(p_concepto), ''), 'Cuota'), coalesce(p_monto, falta), p_fecha_limite)
  returning id into qid;
  return qid;
end $$;

grant execute on function agregar_cuota to authenticated;
