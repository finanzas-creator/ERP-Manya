-- 028 · Notas de crédito (R-27, R-28) y comprobantes con sus archivos. Una factura emitida no se
-- borra ni se edita: se corrige con una nota de crédito, como exige SUNAT.
--   · Total (anula la operación): la factura deja de estar vigente y sus cuotas vuelven a
--     "por facturar" (para facturarlas de nuevo o anular la venta si se cayó).
--   · Parcial (descuento, devolución de una parte, ajuste): baja lo que el cliente debe y el
--     ingreso del mes de la nota, repartida entre las cuotas de la factura.
-- "Anular" un comprobante (R-81) queda solo para registros hechos por error en el sistema.

-- Catálogo 09 de SUNAT: tipo de nota de crédito. "anula" = deja sin efecto toda la factura.
create table motivo_nota_credito (
  codigo  text primary key,
  nombre  text not null,
  anula   boolean not null
);
insert into motivo_nota_credito values
  ('01', 'Anulación de la operación', true),
  ('02', 'Anulación por error en el RUC', true),
  ('03', 'Corrección por error en la descripción', false),
  ('04', 'Descuento global', false),
  ('05', 'Descuento por ítem', false),
  ('06', 'Devolución total', true),
  ('07', 'Devolución por ítem', false),
  ('08', 'Bonificación', false),
  ('09', 'Disminución en el valor', false),
  ('13', 'Ajustes de montos y/o fechas de pago', false);

create table nota_credito (
  id               uuid primary key default gen_random_uuid(),
  comprobante_id   uuid not null references comprobante,
  serie_numero     text not null,
  fecha_emision    date not null,
  motivo_codigo    text not null references motivo_nota_credito,
  monto_neto       dinero not null check (monto_neto > 0),   -- en la moneda de la factura, sin IGV
  descripcion      text,
  archivo_pdf      text,
  archivo_xml      text,
  registrado_en    timestamptz not null default now(),
  anulado_en       timestamptz,
  anulado_motivo   text,
  check ((anulado_en is null) = (anulado_motivo is null))
);
create index on nota_credito (comprobante_id);

-- Archivos del comprobante electrónico (rutas en la carpeta privada "comprobantes").
alter table comprobante add column archivo_pdf text;
alter table comprobante add column archivo_xml text;

-- Facturas sin efecto por una nota de crédito total (R-27).
create view v_nota_credito_total with (security_invoker = true) as
select nc.comprobante_id, nc.id as nota_credito_id, nc.serie_numero
from nota_credito nc join motivo_nota_credito m on m.codigo = nc.motivo_codigo
where m.anula and nc.anulado_en is null;

-- R-28: cada nota parcial repartida entre las cuotas de su factura, en proporción a su neto.
-- Si después la factura queda sin efecto (nota total), las parciales dejan de aplicar.
create view v_nota_credito_cuota with (security_invoker = true) as
with cuotas as (
  select c.id, c.venta_id, c.comprobante_id, c.monto_neto, v.pct_igv, v.moneda,
         sum(c.monto_neto) over (partition by c.comprobante_id) as neto_comprobante
  from cuota c join venta v on v.id = c.venta_id
  where c.anulado_en is null and c.comprobante_id is not null
)
select nc.id as nota_credito_id, q.id as cuota_id, q.venta_id, nc.fecha_emision, q.moneda,
       nc.monto_neto * q.monto_neto / nullif(q.neto_comprobante, 0) as neto,
       nc.monto_neto * q.monto_neto / nullif(q.neto_comprobante, 0) * (1 + q.pct_igv) as total
from nota_credito nc
join motivo_nota_credito m on m.codigo = nc.motivo_codigo and not m.anula
join cuotas q on q.comprobante_id = nc.comprobante_id
where nc.anulado_en is null
  and not exists (select 1 from v_nota_credito_total t where t.comprobante_id = nc.comprobante_id);  -- sin efecto: ya no aplica

create or replace view v_cuota with (security_invoker = true) as
with pagos as (
  select cuota_id,
         sum(monto_moneda_venta) filter (where not es_detraccion) as pagado_banco,
         sum(monto_moneda_venta) filter (where es_detraccion)     as pagado_detraccion,
         max(fecha) as ultimo_pago
  from v_pago group by cuota_id
), base as (
  select c.id, c.venta_id, c.orden, c.concepto, c.fecha_limite as fecha_limite_contrato,
         co.id as comprobante_id, co.fecha_limite as fecha_limite_cliente,
         vb.moneda, vb.fecha_contrato, vb.cliente_id, vb.cliente, vb.marca, vb.servicio,
         c.monto_neto,
         c.monto_neto * vb.pct_igv as igv,                                     -- R-12
         c.monto_neto * (1 + vb.pct_igv) as total,
         coalesce(p.pagado_banco, 0) as pagado_banco,
         coalesce(p.pagado_detraccion, 0) as pagado_detraccion,
         p.ultimo_pago
  from cuota c
  join v_venta_base vb on vb.id = c.venta_id
  left join comprobante co on co.id = c.comprobante_id and co.anulado_en is null
    and not exists (select 1 from v_nota_credito_total t where t.comprobante_id = co.id)                -- R-27
  left join pagos p on p.cuota_id = c.id
  where c.anulado_en is null
)
select b.*, s1.pagado, s1.saldo, s2.saldo_usd, s1.monto_neto_usd, s1.vencimiento, s3.pagada,
       case                                                                        -- R-34
         when s3.pagada then 'pagada'
         when b.comprobante_id is null then 'por_facturar'
         when s1.vencimiento < current_date then 'vencida'
         else 'por_cobrar'
       end as estado,
       coalesce(nc.nc, 0) as nota_credito                                          -- R-28
from base b
left join (select cuota_id, sum(total) as nc from v_nota_credito_cuota group by cuota_id) nc on nc.cuota_id = b.id
cross join lateral (
  select b.pagado_banco + b.pagado_detraccion as pagado,
         b.total - coalesce(nc.nc, 0) - b.pagado_banco - b.pagado_detraccion as saldo,             -- R-28
         a_usd(b.monto_neto, b.moneda, b.fecha_contrato) as monto_neto_usd,
         coalesce(b.fecha_limite_cliente, b.fecha_limite_contrato) as vencimiento    -- R-23
) s1
cross join lateral (select a_usd(s1.saldo, b.moneda, b.fecha_contrato) as saldo_usd) s2
cross join lateral (                                                              -- R-33
  select s2.saldo_usd <= tolerancia_usd(a_usd(b.total, b.moneda, b.fecha_contrato)) as pagada
) s3;

-- R-05 + R-28: la nota parcial baja el ingreso de cada venta en el mes en que se emite.
create or replace view v_ingreso_venta_mes with (security_invoker = true) as
select vb.id as venta_id, vb.cliente_id, vb.linea_id, vb.linea, vb.categoria, vb.modalidad,
       vb.equipo_id, m.mes::date as periodo,
       vb.monto_neto_usd / r.meses as ingreso_usd
from v_venta_base vb
cross join lateral (
  select vb.periodo_servicio as ini,
         case when vb.modalidad = 'proyecto' and vb.fecha_fin is not null
              then date_trunc('month', vb.fecha_fin)::date
              else vb.periodo_servicio end as fin
) p
cross join lateral (
  select (extract(year from p.fin) * 12 + extract(month from p.fin))
       - (extract(year from p.ini) * 12 + extract(month from p.ini)) + 1 as meses
) r
cross join lateral generate_series(p.ini, p.fin, interval '1 month') m(mes)
where vb.naturaleza = 'propio'
union all
select vb.id, vb.cliente_id, vb.linea_id, vb.linea, vb.categoria, vb.modalidad, vb.equipo_id,
       date_trunc('month', n.fecha_emision)::date, -a_usd(n.neto, n.moneda, n.fecha_emision)
from v_nota_credito_cuota n
join v_venta_base vb on vb.id = n.venta_id
where vb.naturaleza = 'propio';

-- Un comprobante está vigente si no se anuló ni lo dejó sin efecto una nota de crédito total.
create function comprobante_vigente(p_id uuid) returns boolean language sql stable as $$
  select exists (select 1 from comprobante c where c.id = p_id and c.anulado_en is null)
     and not exists (select 1 from v_nota_credito_total t where t.comprobante_id = p_id)
$$;

-- R-21: una cuota cuyo comprobante ya no está vigente puede volver a facturarse.
create or replace function emitir_comprobante(
  p_empresa smallint, p_tipo tipo_comprobante, p_serie_numero text, p_fecha_emision date,
  p_cuotas uuid[], p_fecha_limite date default null, p_pct_detraccion numeric default null
) returns uuid language plpgsql as $$
declare cid uuid;
begin
  if exists (select 1 from cuota where id = any(p_cuotas) and comprobante_vigente(comprobante_id)) then
    raise exception 'R-21: alguna cuota ya tiene un comprobante vigente';
  end if;
  insert into comprobante (empresa_id, tipo, serie_numero, fecha_emision, fecha_limite, pct_detraccion)
  values (p_empresa, p_tipo, nullif(trim(p_serie_numero), ''), p_fecha_emision, p_fecha_limite,
          coalesce(p_pct_detraccion, detraccion_sugerida(p_tipo, p_cuotas, p_fecha_emision)))
  returning id into cid;
  update cuota set comprobante_id = cid where id = any(p_cuotas);
  return cid;
end $$;

-- R-13: lo protegido es lo facturado en un comprobante vigente.
create or replace function proteger_cuota_facturada() returns trigger language plpgsql as $$
begin
  if not edita_facturado_libre() and comprobante_vigente(old.comprobante_id)
     and new.comprobante_id is not distinct from old.comprobante_id
     and (new.monto_neto <> old.monto_neto or new.venta_id <> old.venta_id) then
    raise exception 'R-13: la cuota ya está facturada; solo el administrador puede cambiar su monto';
  end if;
  return new;
end $$;

create or replace function proteger_venta_facturada() returns trigger language plpgsql as $$
begin
  if not edita_facturado_libre() and (new.pct_igv <> old.pct_igv or new.moneda <> old.moneda)
     and exists (select 1 from cuota where venta_id = new.id and anulado_en is null and comprobante_vigente(comprobante_id)) then
    raise exception 'R-13: la venta tiene cuotas facturadas; solo el administrador puede cambiar su IGV o moneda';
  end if;
  return new;
end $$;

-- R-27/R-28: emitir una nota de crédito. Total: por el neto de la factura. Parcial: hasta lo
-- que queda de la factura después de otras notas.
create function emitir_nota_credito(p_comprobante uuid, p_serie_numero text, p_fecha date, p_motivo text,
  p_monto_neto numeric default null, p_descripcion text default null) returns uuid language plpgsql as $$
declare m motivo_nota_credito; neto numeric; previas numeric; monto numeric; nid uuid;
begin
  if not comprobante_vigente(p_comprobante) then raise exception 'R-27: el comprobante no está vigente'; end if;
  if coalesce(trim(p_serie_numero), '') = '' then raise exception 'R-27: indica la serie y número de la nota de crédito'; end if;
  select * into m from motivo_nota_credito where codigo = p_motivo;
  if m.codigo is null then raise exception 'R-27: motivo de nota de crédito no válido'; end if;
  select sum(monto_neto) into neto from cuota where comprobante_id = p_comprobante and anulado_en is null;
  select coalesce(sum(monto_neto), 0) into previas from nota_credito where comprobante_id = p_comprobante and anulado_en is null;
  monto := case when m.anula then neto - previas else p_monto_neto end;
  if monto is null or monto <= 0 then raise exception 'R-28: indica el monto (sin IGV) de la nota de crédito'; end if;
  if monto > neto - previas + 0.005 then
    raise exception 'R-28: la nota (%) supera lo que queda de la factura (%)', round(monto, 2), round(neto - previas, 2);
  end if;
  insert into nota_credito (comprobante_id, serie_numero, fecha_emision, motivo_codigo, monto_neto, descripcion)
  values (p_comprobante, trim(p_serie_numero), p_fecha, p_motivo, monto, nullif(trim(p_descripcion), ''))
  returning id into nid;
  return nid;
end $$;

-- R-81: las notas de crédito también se anulan (solo si se registraron por error).
create or replace function anular(p_tabla text, p_id uuid, p_motivo text) returns void language plpgsql as $$
begin
  if p_tabla not in ('venta', 'cuota', 'comprobante', 'pago', 'costo_directo', 'planilla',
                     'herramienta_gasto', 'comision_pago', 'gestion_cobranza', 'nota_credito') then
    raise exception 'R-81: % no admite anulación', p_tabla;
  end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'R-81: la anulación requiere motivo'; end if;
  execute format('update %I set anulado_en = now(), anulado_motivo = $1 where id = $2 and anulado_en is null', p_tabla)
    using p_motivo, p_id;
end $$;

-- Facturación: todos los comprobantes (también los anulados o sin efecto) con su estado.
create view v_facturacion with (security_invoker = true) as
with lineas as (
  select c.comprobante_id, min(sc.cliente_id::text)::uuid as cliente_id, min(v.moneda::text)::moneda as moneda,
         sum(c.monto_neto) as neto, sum(c.monto_neto * (1 + v.pct_igv)) as total, count(*) as cuotas
  from cuota c join venta v on v.id = c.venta_id join servicio_contratado sc on sc.id = v.servicio_contratado_id
  where c.anulado_en is null and c.comprobante_id is not null
  group by c.comprobante_id
), notas as (
  select comprobante_id, count(*) as notas, sum(monto_neto) as notas_neto
  from nota_credito where anulado_en is null group by comprobante_id
)
select co.id, co.empresa_id, e.nombre as empresa, e.ruc as empresa_ruc, co.tipo, co.serie_numero,
       co.fecha_emision, co.fecha_limite, co.pct_detraccion, l.cliente_id, cl.razon_social as cliente,
       cl.ruc as cliente_ruc, l.moneda, l.neto, l.total, l.cuotas,
       coalesce(n.notas, 0) as notas_credito, coalesce(n.notas_neto, 0) as notas_credito_neto,
       vc.saldo, vc.pagado_banco, vc.pagado_detraccion, vc.vencimiento, vc.detraccion,
       case
         when co.anulado_en is not null then 'anulado'
         when t.comprobante_id is not null then 'sin_efecto'
         when vc.pagado_100 then 'pagada'
         when vc.vencimiento < current_date then 'vencida'
         else 'por_cobrar'
       end as estado,
       co.anulado_motivo, t.serie_numero as nota_credito_total, co.archivo_pdf, co.archivo_xml
from comprobante co
join empresa e on e.id = co.empresa_id
left join lineas l on l.comprobante_id = co.id
left join cliente cl on cl.id = l.cliente_id
left join notas n on n.comprobante_id = co.id
left join v_nota_credito_total t on t.comprobante_id = co.id
left join v_comprobante vc on vc.id = co.id;

create view v_nota_credito with (security_invoker = true) as
select nc.id, nc.comprobante_id, co.serie_numero as comprobante, co.empresa_id, nc.serie_numero, nc.fecha_emision,
       nc.motivo_codigo, m.nombre as motivo, m.anula, nc.monto_neto, nc.descripcion, nc.archivo_pdf, nc.archivo_xml
from nota_credito nc
join motivo_nota_credito m on m.codigo = nc.motivo_codigo
join comprobante co on co.id = nc.comprobante_id
where nc.anulado_en is null;

-- Permisos y bitácora (R-80, R-82).
alter table nota_credito enable row level security;
alter table motivo_nota_credito enable row level security;
create policy lectura on nota_credito for select to authenticated using ((select app_rol() in ('admin', 'tesoreria')));
create policy alta on nota_credito for insert to authenticated with check ((select app_rol() in ('admin', 'tesoreria')));
create policy edicion on nota_credito for update to authenticated
  using ((select app_rol() in ('admin', 'tesoreria'))) with check ((select app_rol() in ('admin', 'tesoreria')));
create policy lectura on motivo_nota_credito for select to authenticated using ((select app_rol() is not null));
grant select, insert, update on nota_credito to authenticated;
grant select on motivo_nota_credito, v_nota_credito_total, v_nota_credito_cuota, v_facturacion, v_nota_credito to authenticated;
revoke all on nota_credito, motivo_nota_credito, v_nota_credito_total, v_nota_credito_cuota, v_facturacion, v_nota_credito from anon;
revoke execute on function emitir_nota_credito(uuid, text, date, text, numeric, text), comprobante_vigente(uuid) from public, anon;
grant execute on function emitir_nota_credito(uuid, text, date, text, numeric, text), comprobante_vigente(uuid) to authenticated;
create trigger nota_credito_auditoria after insert or update or delete on nota_credito
  for each row execute function registrar_auditoria();
create trigger nota_credito_cierre before insert or update or delete on nota_credito
  for each row execute function bloquear_mes_cerrado('fecha_emision');

-- Carpeta privada para PDF y XML de comprobantes y notas (solo donde existe Storage).
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('comprobantes', 'comprobantes', false) on conflict (id) do nothing;
    execute $p$create policy comprobantes_lectura on storage.objects for select to authenticated
             using (bucket_id = 'comprobantes' and (select public.app_rol() in ('admin', 'tesoreria')))$p$;
    execute $p$create policy comprobantes_alta on storage.objects for insert to authenticated
             with check (bucket_id = 'comprobantes' and (select public.app_rol() in ('admin', 'tesoreria')))$p$;
  end if;
end $$;
