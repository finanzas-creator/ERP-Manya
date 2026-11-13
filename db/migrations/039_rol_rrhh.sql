-- 039 · Rol Recursos humanos (R-125): opera solo Planillas. Va solo en este archivo porque un valor
-- nuevo de un enum no se puede usar en la misma transacción en que se agrega.
alter type rol add value if not exists 'rrhh';
