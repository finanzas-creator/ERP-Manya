"""Genera app/src/lib/db.ts (tipos TypeScript en el formato de supabase-js) desde la base.

Uso: python3 db/gen_tipos.py <base_de_datos> <salida.ts>
La base es la fuente de verdad: la app nunca escribe tipos a mano (DRY).
"""
import subprocess
import sys

SQL = """
select c.table_name, t.table_type, c.column_name, c.udt_name, c.data_type, c.is_nullable
from information_schema.columns c
join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
where c.table_schema = 'public'
order by c.table_name, c.ordinal_position
"""
ENUMS = """
select t.typname, string_agg(e.enumlabel, '|' order by e.enumsortorder)
from pg_type t join pg_enum e on e.enumtypid = t.oid
join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' group by 1
"""
DOMINIOS = """
select t.typname, b.typname from pg_type t join pg_type b on b.oid = t.typbasetype
join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typtype = 'd'
"""
FUNCIONES = """
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute') order by 1
"""

NUM = {"int2", "int4", "int8", "numeric", "float4", "float8"}


def q(db, sql):
    out = subprocess.run(["psql", "-X", "-At", "-F", "\t", "-d", db, "-c", sql],
                         capture_output=True, text=True, check=True).stdout
    return [l.split("\t") for l in out.splitlines() if l]


def main():
    db, salida = sys.argv[1], sys.argv[2]
    enums = {k: v.split("|") for k, v in q(db, ENUMS)}
    dominios = dict(q(db, DOMINIOS))

    def ts(udt, data_type):
        udt = dominios.get(udt, udt)
        if udt in enums:
            return "Enums['" + udt + "']"
        if udt in NUM:
            return "number"
        if udt == "bool":
            return "boolean"
        if udt in ("json", "jsonb"):
            return "Json"
        if data_type == "ARRAY":
            return ts(udt.lstrip("_"), "") + "[]"
        return "string"

    tablas, vistas = {}, {}
    for tabla, tipo, col, udt, dt, nul in q(db, SQL):
        destino = tablas if tipo == "BASE TABLE" else vistas
        t = ts(udt, dt) + (" | null" if nul == "YES" else "")
        destino.setdefault(tabla, []).append(f"{col}: {t}")

    def bloque(objs, escribible):
        partes = []
        for nombre, cols in sorted(objs.items()):
            row = "{ " + "; ".join(cols) + " }"
            extra = (f"; Insert: Partial<{row}>; Update: Partial<{row}>; Relationships: []" if escribible
                     else "; Relationships: []")
            partes.append(f"      {nombre}: {{ Row: {row}{extra} }}")
        return "\n".join(partes)

    funciones = "\n".join(f"      {f}: {{ Args: Record<string, unknown>; Returns: unknown }}"
                          for (f,) in q(db, FUNCIONES))
    enums_const = "\n".join(f"  {k}: [" + ", ".join(f"'{x}'" for x in v) + "]," for k, v in sorted(enums.items()))
    enums_ts = "\n".join(f"      {k}: " + " | ".join(f"'{x}'" for x in v) for k, v in sorted(enums.items()))
    with open(salida, "w") as f:
        f.write(f"""// GENERADO por db/gen_tipos.py desde la base de datos. No editar a mano.
export type Json = string | number | boolean | null | {{ [key: string]: Json }} | Json[]
type Enums = Database['public']['Enums']

export type Database = {{
  public: {{
    Tables: {{
{bloque(tablas, True)}
    }}
    Views: {{
{bloque(vistas, False)}
    }}
    Functions: {{
{funciones}
    }}
    Enums: {{
{enums_ts}
    }}
    CompositeTypes: {{ [_ in never]: never }}
  }}
}}

// Valores de cada enum de la base, para los selectores (los define la base, no la app).
export const ENUMS = {{
{enums_const}
}} as const

export type Fila<T extends keyof Database['public']['Views'] | keyof Database['public']['Tables']> =
  T extends keyof Database['public']['Views'] ? Database['public']['Views'][T]['Row']
  : T extends keyof Database['public']['Tables'] ? Database['public']['Tables'][T]['Row'] : never
""")


if __name__ == "__main__":
    main()
