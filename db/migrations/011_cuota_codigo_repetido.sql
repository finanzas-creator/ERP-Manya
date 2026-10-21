-- 011 · Una línea del sheet puede repetir código (D-18): varias cuotas comparten su código de origen.
alter table cuota drop constraint cuota_codigo_legacy_key;
