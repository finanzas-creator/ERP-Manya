# Planillas · Guía de integración para el área de sistemas

El módulo **Planillas** del ERP calcula la planilla de cada empleador (HoldingD y las demás
entidades): sueldos, AFP/ONP con las tasas SBS del mes, EsSalud, quinta categoría, gratificaciones,
CTS, provisiones, vacaciones, liquidaciones y boletas. Las reglas están en
[`spec/02-reglas.md`](../spec/02-reglas.md) (R-100 a R-126).

El ERP de control de personal **no calcula nada**: envía los hechos (quién trabaja, cuánto gana, qué
pasó cada día) y lee los resultados. Así un número nunca difiere entre los dos sistemas.

```
ERP de personal ──(trabajadores, asistencia, ausencias, montos)──▶ Planillas (Supabase / Postgres)
                ◀──(planilla, boletas, beneficios, liquidaciones)──
```

## 1. Conexión

| Dato | Valor |
|---|---|
| API | `https://eiygcmpsbopcgfgnxwhr.supabase.co` (Supabase: PostgREST + Auth) |
| Clave pública (`apikey`) | La clave *anon* del proyecto; la entrega el administrador del ERP |
| Usuario | Un usuario con rol **Recursos humanos** (`rrhh`): solo ve y opera Planillas |
| Pantallas | https://manya-erp.pages.dev → Planillas |

**Obtener el token** (dura 1 hora; se renueva con `grant_type=refresh_token`):

```bash
curl -s "$API/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"email": "integracion@empresa.pe", "password": "..."}'
# → { "access_token": "...", "refresh_token": "...", "expires_in": 3600 }
```

Todas las llamadas llevan `apikey: $ANON` y `Authorization: Bearer $TOKEN`. Los permisos se validan
en la base (RLS): el usuario de integración no puede leer ventas, clientes ni nada fuera de Planillas.

## 2. Enviar datos (escritura)

Todas son llamadas `POST $API/rest/v1/rpc/<función>` con un JSON. Cada llamada es **todo o nada**:
si una fila tiene un error, no se guarda ninguna y la respuesta dice cuál falló (mensajes que empiezan
con `R-126`). El trabajador se identifica con su **código externo** (el código del ERP de personal,
p. ej. `H-07`) dentro del empleador indicado por su **RUC**. Un mes con planilla **cerrada** no acepta
cambios (`R-123`).

### 2.1 `integrar_trabajadores(p_ruc, p_trabajadores)`

Alta o actualización. Solo cambian los campos que se envían. Un `sueldo_basico` distinto del
vigente crea una nueva vigencia desde `sueldo_desde` (por defecto, el 1 del mes en curso; en un alta,
la fecha de ingreso). Reenviar lo mismo no cambia nada.

```json
{ "p_ruc": "20613705849",
  "p_trabajadores": [
    { "codigo_externo": "H-07", "tipo_documento": "DNI", "numero_documento": "70000000",
      "apellidos_nombres": "APELLIDO APELLIDO, NOMBRES", "cargo": "Asistente de Proyectos",
      "fecha_ingreso": "2025-02-01", "sueldo_basico": 2600,
      "sistema_pension": "afp", "afp": "INTEGRA", "comision_afp": "mixta", "cuspp": "123456ABCDE1",
      "asignacion_familiar": false, "salud": "essalud", "jornada_horas": 8, "domiciliado": true,
      "banco": "BCP", "cuenta_sueldo": "...", "banco_cts": "...", "cuenta_cts": "...", "correo": "..." } ] }
```

| Campo | Tipo | Notas |
|---|---|---|
| `codigo_externo` | texto | **Obligatorio.** Clave del trabajador en el ERP de personal |
| `numero_documento`, `apellidos_nombres`, `fecha_ingreso`, `sueldo_basico` | | Obligatorios en un alta |
| `tipo_documento` | `DNI` · `CE` · `PASAPORTE` | Por defecto DNI |
| `fecha_cese`, `motivo_cese` | fecha, código | Van juntos. Motivos: `RENUNCIA`, `FIN_CONTRATO`, `MUTUO_DISENSO`, `DESPIDO_ARBITRARIO`, `DESPIDO_JUSTIFICADO`, `NO_SUPERA_PRUEBA`, `FALLECIMIENTO`, `JUBILACION`. El cese genera la liquidación |
| `fecha_fin_contrato` | fecha | Contrato a plazo fijo (vacío = indeterminado) |
| `sistema_pension` | `onp` · `afp` · `sin_sistema` | Con `afp`: `afp` (`HABITAT`, `INTEGRA`, `PRIMA`, `PROFUTURO`), `comision_afp` (`flujo` · `mixta`) y `cuspp` |
| `asignacion_familiar` | sí/no | 10% de la RMV |
| `salud` | `essalud` · `eps` · `sis` | |
| `jornada_horas` | número | Menos de 4 h: sin CTS, vacaciones ni indemnización |
| `domiciliado` | sí/no | No domiciliado: quinta 30% |
| `regimen_pactado` | `general` · `pequena` · `micro` | Solo si se pactó; si no, sale del REMYPE |
| `sueldo_desde` | fecha | Desde cuándo rige el sueldo enviado |

Respuesta: `{"creados": 1, "actualizados": 0, "sueldos": 1}`.

### 2.2 `integrar_asistencia(p_ruc, p_dias)`

Un registro por trabajador y día **con incidencias**. Reenviar un día lo reemplaza; un día sin horas
extra, feriado ni tardanza borra (anula) lo que hubiera.

```json
{ "p_ruc": "20613705849",
  "p_dias": [ { "codigo_externo": "H-07", "fecha": "2026-11-03", "horas_extra": 3,
                "feriado_trabajado": false, "minutos_tardanza": 15, "detalle": "Cierre de proyecto" } ] }
```

- `horas_extra`: horas del día por encima de la jornada (las 2 primeras al 25%, el resto al 35%).
- `feriado_trabajado`: trabajó en feriado o en su día de descanso **sin descanso sustitutorio**.

### 2.3 `integrar_ausencias(p_ruc, p_desde, p_hasta, p_ausencias)`

Reemplaza las ausencias que la integración envió antes en ese rango de fechas (las registradas a
mano en la app se respetan). Una ausencia que cruza meses se guarda partida por mes.

```json
{ "p_ruc": "20613705849", "p_desde": "2026-11-01", "p_hasta": "2026-11-30",
  "p_ausencias": [ { "codigo_externo": "H-07", "tipo": "VACACIONES", "desde": "2026-11-16", "hasta": "2026-11-30" },
                   { "codigo_externo": "H-04", "tipo": "FALTA", "desde": "2026-11-05", "hasta": "2026-11-05" } ] }
```

| `tipo` | Se paga como | Cuenta para CTS / grati / vacaciones |
|---|---|---|
| `FALTA` | no se paga | no |
| `LICENCIA_SG` (sin goce) | no se paga | no |
| `SUSPENSION` | no se paga | no |
| `LICENCIA_CG` (con goce) | sueldo | sí |
| `DESCANSO_MEDICO` (a cargo del empleador, primeros 20 días) | sueldo | sí |
| `SUBSIDIO_IT` (incapacidad subsidiada por EsSalud) | subsidio | sí |
| `MATERNIDAD` | subsidio | sí |
| `PATERNIDAD` | sueldo | sí |
| `VACACIONES` | remuneración vacacional | sí |

### 2.4 `integrar_movimientos(p_ruc, p_periodo, p_movimientos)`

Montos del mes. Reemplaza los enviados antes por la integración para ese mes.

```json
{ "p_ruc": "20613705849", "p_periodo": "2026-11-01",
  "p_movimientos": [ { "codigo_externo": "H-15", "concepto": "ADELANTO", "monto": 225.65, "detalle": "Quincena" },
                     { "codigo_externo": "H-01", "concepto": "BONO_PRODUCTIVIDAD", "monto": 500 } ] }
```

Conceptos que se pueden enviar: `BONO_FIJO`, `COMISION`, `BONO_PRODUCTIVIDAD`, `BONO_EXTRA`,
`REINTEGRO`, `MOVILIDAD`, `OTRO_NO_REM` (ingresos); `ADELANTO`, `PRESTAMO`, `JUDICIAL`, `DESC_OTRO`,
`DESC_LIQUIDACION` (descuentos). Cada concepto ya sabe si está afecto a EsSalud, pensión y quinta.

## 3. Leer resultados

`GET $API/rest/v1/<vista>?<filtros>` (filtros PostgREST: `campo=eq.valor`, `order=campo.asc`).
El `empleador_id` se obtiene una vez: `GET /rest/v1/empleador?ruc=eq.20613705849&select=id`.

| Vista | Qué trae | Filtro típico |
|---|---|---|
| `v_planilla` | Una fila por trabajador y mes: días, ingresos, descuentos, neto, EsSalud, quinta, pensión, provisiones, costo empresa, si está cerrada y su boleta | `empleador_id=eq.1&periodo=eq.2026-11-01` |
| `v_planilla_resumen` | Totales del empleador por mes | `empleador_id=eq.1` |
| `v_boleta_linea` | Líneas de la boleta (concepto, código PLAME, tipo, monto) | `trabajador_id=eq.<uuid>&periodo=eq.2026-11-01` |
| `boleta` | Boletas **emitidas** al cerrar (copia fiel en `datos`, JSON) y su entrega | `empleador_id=eq.1&periodo=eq.2026-11-01&anulado_en=is.null` |
| `v_pl_observacion` | Lo que falta revisar (las que `bloquea` impiden cerrar) | `empleador_id=eq.1&periodo=eq.2026-11-01` |
| `v_gratificacion`, `v_cts` | Gratificación y CTS por semestre (regular, depósito o trunca) | `empleador_id=eq.1` |
| `v_provision_mes` | Provisiones del mes por trabajador | `empleador_id=eq.1&periodo=eq.2026-11-01` |
| `v_vacaciones`, `v_vacacion_periodo` | Saldo de vacaciones: ganadas, gozadas, pendientes, vencidas, adelantadas, truncas | `trabajador_id=eq.<uuid>` |
| `v_liquidacion`, `v_liquidacion_linea` | Liquidación de cada cese y su detalle | `empleador_id=eq.1` |
| `v_trabajador` | Trabajador con régimen y sueldo vigentes, estado | `empleador_id=eq.1&codigo_externo=eq.H-07` |

## 4. Flujo mensual sugerido

1. **Cada día** (o al cerrar el día en el ERP de personal): `integrar_asistencia` con los días que
   tuvieron horas extra, feriado trabajado o tardanza.
2. **Al registrar** un ingreso, cese, cambio de sueldo, AFP o cuenta: `integrar_trabajadores`.
3. **Antes del cierre**: `integrar_ausencias` del mes completo y `integrar_movimientos` (bonos,
   adelantos, descuentos).
4. Recursos humanos revisa la planilla y sus observaciones en la app y la **cierra**: se emiten las
   boletas y el mes queda bloqueado.
5. El ERP de personal lee `boleta` (o `v_planilla`) para pagos, envío de boletas y contabilidad.

Las tasas AFP se actualizan solas desde la SBS cada día; RMV, UIT y demás parámetros los registra el
administrador con su norma. No hace falta enviarlos.

## 5. Probar en local

```bash
make db              # base local con todas las migraciones
make demo-planilla   # empleador y trabajadores ficticios
make test            # incluye db/tests/96_integracion_planilla.sql: ejemplos de cada función
```

## 6. Si prefieren instalar el módulo en su propia base

Es Postgres estándar. Los archivos del módulo son `db/migrations/035` a `040` (`*_planilla_*` y
`039_rol_rrhh.sql`) y la pantalla `app/src/pages/Planillas.tsx` + `app/src/pages/planillas/`. Usan
piezas del ERP base que habría que traer o reemplazar: los dominios `dinero`, `porcentaje` y `mes` y
`tc_de` (001), `usuario`, `app_rol()`, `auditoria` y `registrar_auditoria()` (001, 006),
`tipo_documento` (027), `anular()` (028), `auth.uid()` (Supabase; en local `db/local/supabase_shim.sql`)
y, para las tasas SBS automáticas, las extensiones `http` y `pg_cron`. La opción recomendada es
integrarse por la API (secciones 1 a 4): un solo motor de cálculo, ya probado y conciliado con la
planilla de HoldingD de octubre 2026.
