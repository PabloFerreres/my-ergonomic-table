# backend/loading/create_materialized_tables.py

import sys
import os
if __name__ == "__main__":
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import psycopg2
from backend.settings.connection_points import DB_URL, get_views_to_show, DEBUG


def _get_header_rows_flag(cursor, view_id: int) -> bool:
    """
    Liest views.header_rows; fehlt die Spalte, fallback = TRUE (Backwards-kompatibel).
    """
    try:
        cursor.execute("SELECT COALESCE(header_rows, TRUE) FROM views WHERE id = %s", (view_id,))
        r = cursor.fetchone()
        return bool(r[0]) if r else True
    except Exception:
        return True


def get_materialized_table(cursor, project_id: int, view_id: int):
    cursor.execute("""
        SELECT v.name AS view_name, p.name AS project_name
        FROM views v
        JOIN projects p ON v.project_id = p.id
        WHERE v.id = %s AND p.id = %s
    """, (view_id, project_id))
    row = cursor.fetchone()
    if not row:
        if DEBUG:
            print(f"[DEBUG] No materialized table name found for view_id={view_id}, project_id={project_id}")
        return None
    view_name, project_name = row
    table_name = f"materialized_{view_name.lower()}_{project_name.lower()}"
    if DEBUG:
        print(f"[DEBUG] Table name generated: {table_name}")
    return table_name


def create_materialized_table(project_id: int, view_id, base_view_id):
    import json
    from pathlib import Path

    conn = psycopg2.connect(DB_URL)
    cursor = conn.cursor()

    # Only allow Elektrik materialization via create_materialized_elektrik
    if base_view_id == 2:
        print(f"[SKIP] Elektrik table (base_view_id=2) will only be materialized via create_materialized_elektrik.")
        cursor.close()
        conn.close()
        return

    # 0) Index für schnellen Lookup (id ohne Cast nutzbar)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_me_pid_id
        ON materialized_einbauorte(project_id, id);
    """)

    table_name = get_materialized_table(cursor, project_id, view_id)
    if not table_name:
        if DEBUG:
            print(f"[DEBUG] Skipping create_materialized_table for view_id={view_id}: table name not found.")
        cursor.close()
        conn.close()
        return

    # 1. Fetch visible layout columns
    cursor.execute("""
        SELECT c.name, c.name_external_german, vc.position
        FROM views_columns vc
        JOIN columns c ON vc.column_id = c.id
        WHERE vc.base_view_id = %s
        AND vc.visible = TRUE
        ORDER BY vc.position
    """, (base_view_id,))
    layout_columns = cursor.fetchall()
    if DEBUG:
        print(f"[DEBUG] Layout columns for base_view_id={base_view_id}: {layout_columns}")

    # Map layout name -> external german name (no lower/strip, must match exactly)
    layout_name_map = {}
    for name, name_external_german, _ in layout_columns:
        if name:
            if name in layout_name_map:
                print(f"[WARNING] Duplicate column name in layout: {name}")
            layout_name_map[name] = (name_external_german or name)

    # No need to load HEADER_MAP anymore, as external names come from columns.name_external_german
    # Remove loading and usage of HEADER_MAP

    # 3. Get all available columns from all layout sources
    cursor.execute("""
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_name IN (
            'project_articles',
            'article_drafts',
            'articles'
        )
    """)
    colmap = {"p": set(), "ad": set(), "a": set()}
    for table, col in cursor.fetchall():
        key = {
            "project_articles": "p",
            "article_drafts": "ad",
            "articles": "a"
        }[table]
        colmap[key].add(col)
    if DEBUG:
        print(f"[DEBUG] colmap: {colmap}")

    # 4. Build column expressions from layout
    col_exprs = []
    output_cols = []
    col_exprs.append("(pd.data->>'project_article_id')::int AS project_article_id")
    output_cols.append("project_article_id")
    kommentar_display = layout_name_map.get("kommentar", "Kommentar")
    einbauort_display = layout_name_map.get("einbauort", "Einbauort")
    einbauort_id_text_expr = None

    einbauort_in_layout = "einbauort" in layout_name_map

    for layout_col, materialized_col in layout_name_map.items():
        if layout_col == "project_article_id":
            continue
        in_p = layout_col in colmap["p"]
        in_ad = layout_col in colmap["ad"]
        in_a = layout_col in colmap["a"]
        sources = []
        if in_p:
            sources.append(f'pa."{layout_col}"')
        if in_a:
            sources.append(f'a."{layout_col}"')
        if in_ad:
            sources.append(f'ad."{layout_col}"')
        # Special handling for einbauort: output full name from materialized_einbauorte (with parents and IDs)
        if layout_col == "einbauort":
            # Only use pa."einbauort" for einbauort, never ad or a
            layout_expr = 'NULLIF(TRIM(pa."einbauort"::text), \'\')'
            id_txt = f"""
                CASE
                WHEN {layout_expr} ~ '^[0-9]+$' THEN {layout_expr}
                WHEN {layout_expr} ~ '\\[[0-9]+\\]' THEN regexp_replace({layout_expr}, '.*\\[([0-9]+)\\].*', '\\1')
                ELSE NULL END
            """.strip()
            expr = f"COALESCE((SELECT me.full_name FROM materialized_einbauorte me WHERE me.project_id = {project_id} AND me.id::text = ({id_txt}) LIMIT 1), {layout_expr}) AS \"{materialized_col}\""
            einbauort_id_text_expr = id_txt
        else:
            expr = f"CASE\n            WHEN pa.article_id IS NOT NULL THEN a.\"{layout_col}\"\n            ELSE ad.\"{layout_col}\"\n        END AS \"{materialized_col}\"" if in_a or in_ad else f"pa.\"{layout_col}\" AS \"{materialized_col}\""
        col_exprs.append(expr)
        output_cols.append(materialized_col)

    col_exprs_sql = ",\n    ".join(col_exprs)
    if DEBUG:
        print(f"[DEBUG] Column expressions:\n{col_exprs_sql}")

    # Build a map of column types for header row casting, always fresh from information_schema
    col_type_map = {}
    for table in ["project_articles", "articles", "article_drafts"]:
        cursor.execute("""
            SELECT column_name, data_type FROM information_schema.columns WHERE table_name = %s
        """, (table,))
        for col, typ in cursor.fetchall():
            if col not in col_type_map:
                # Map Postgres types to SQL types for casting
                if typ.startswith("character") or typ == "text" or typ == "varchar":
                    col_type_map[col] = "text"
                elif typ.startswith("int") or typ == "integer" or typ == "bigint" or typ == "smallint":
                    col_type_map[col] = "int"
                elif typ == "numeric":
                    col_type_map[col] = "numeric"
                elif typ == "boolean":
                    col_type_map[col] = "bool"
                else:
                    col_type_map[col] = typ

    # Header-Select-Zeile für Alias b
    header_row_select_parts = []
    for c in output_cols:
        coltype = col_type_map.get(c, "text")
        if c == "project_article_id":
            header_row_select_parts.append(f"NULL::{coltype} AS \"project_article_id\"")
        elif c == kommentar_display:
            header_row_select_parts.append(f"'HEADER'::text AS \"{c}\"")
        elif c == einbauort_display:
            header_row_select_parts.append(f"b.\"{c}\" AS \"{c}\"")
        else:
            header_row_select_parts.append(f"NULL::{coltype} AS \"{c}\"")
    header_row_select_sql = ",\n            ".join(header_row_select_parts)

    # gleiche Select-Zeile, aber für Alias hb (headers_base)
    header_row_select_sql_hb = header_row_select_sql.replace('b."', 'hb."')

    quoted_cols = [f'"{c}"' for c in output_cols]
    body_row_select_sql = ", ".join([f"b.{qc}" for qc in quoted_cols])
    eid_sql = einbauort_id_text_expr if einbauort_id_text_expr else "NULL"
    body_row_select_sql = ", ".join([f"b.{qc}" for qc in quoted_cols])
    eid_sql = einbauort_id_text_expr if einbauort_id_text_expr else "NULL"

    # Add LEFT JOIN to materialized_einbauorte as me only if einbauort is in layout
    if einbauort_in_layout:
        me_join = f'LEFT JOIN materialized_einbauorte me ON me.id = pa."einbauort"::int AND me.project_id = {project_id}'
        einbauort_eid_select = 'pa."einbauort" AS __eid'
    else:
        me_join = ''
        einbauort_eid_select = 'NULL AS __eid'

    ctes_base = f'''
        WITH position_data AS (
            SELECT pm.sheet_name, item.data
            FROM position_meta pm,
                 jsonb_array_elements(pm.position_map) AS item(data)
            WHERE pm.sheet_name = '{table_name}'
        ),
        base_rows AS (
            SELECT
                {col_exprs_sql},
                (pd.data->>'position')::int AS __pos,
                {einbauort_eid_select}
            FROM position_data pd
            LEFT JOIN project_articles pa ON pa.id = (pd.data->>'project_article_id')::int
            LEFT JOIN articles a ON pa.article_id = a.id
            LEFT JOIN article_drafts ad ON ad.project_article_id = pa.id
            {me_join}
        )
    '''

    # ---- Header-Schalter lesen
    header_on = _get_header_rows_flag(cursor, view_id)
    if DEBUG:
        print(f"[DEBUG] header_rows={header_on} for view_id={view_id}; __eid present={einbauort_id_text_expr is not None}")

    print(f"🧱 Creating table: {table_name}")
    cursor.execute(f'DROP TABLE IF EXISTS "{table_name}";')

    if header_on:
        sql = f'''
            CREATE TABLE "{table_name}" AS
            {ctes_base},
            ff AS (
                SELECT
                    b.*,
                    SUM(CASE WHEN b.__eid IS NOT NULL THEN 1 ELSE 0 END)
                      OVER (ORDER BY b.__pos) AS grp
                FROM base_rows b
            ),
            carry AS (
                SELECT
                    ff.*,
                    MAX(ff.__eid) OVER (PARTITION BY ff.grp) AS carried_eid
                FROM ff
            ),
            body AS (
                SELECT
                    {body_row_select_sql},
                    __pos AS order_key
                FROM base_rows b
            ),
            headers_base AS (
                SELECT
                    carry.*,
                    LAG(carry.carried_eid) OVER (ORDER BY carry.__pos) AS prev_carried_eid
                FROM carry
            ),
            headers AS (
                -- Header nur erzeugen, wenn wir eine __eid haben und sich der getragene Einbauort ändert
                SELECT
                    {header_row_select_sql_hb},
                    (hb.__pos - 0.5)::numeric AS order_key
                FROM headers_base hb
                WHERE
                    hb.__eid IS NOT NULL
                    AND (hb.prev_carried_eid IS NULL OR hb.__eid IS DISTINCT FROM hb.prev_carried_eid)
            )
            SELECT * FROM (
                SELECT * FROM headers
                UNION ALL
                SELECT * FROM body
            ) u
            -- 2) Stabile Sortierung: Tie-Breaker nach project_article_id
            ORDER BY u.order_key, COALESCE(project_article_id, 0);
        '''
    else:
        sql = f'''
            CREATE TABLE "{table_name}" AS
            {ctes_base},
            body AS (
                SELECT
                    {body_row_select_sql},
                    __pos AS order_key
                FROM base_rows b
            )
            SELECT * FROM body
            ORDER BY order_key, COALESCE(project_article_id, 0);
        '''

    if DEBUG:
        print(f"[DEBUG] Running CREATE SQL (header_rows={header_on})")
    cursor.execute(sql)
    conn.commit()
    print(f"✅ Created: {table_name}")
    cursor.close()
    conn.close()


def refresh_all_materialized(project_id: int):
    views_to_show = get_views_to_show(project_id)
    for v in views_to_show:
        if isinstance(v, dict):
            view_id = v["view_id"]
            base_view_id = v["base_view_id"]
        else:
            view_id = v
            base_view_id = None  # Not expected, fallback
        if DEBUG:
            print(f"[DEBUG] Creating materialized for view_id={view_id}, base_view_id={base_view_id}")
        create_materialized_table(project_id, view_id, base_view_id)
    print("✅ Alle Materialized Tables wurden aktualisiert.")


if __name__ == "__main__":
    # Debug function: rematerialize for project_id=16, view_id=54, base_view_id=1
    print("[DEBUG] Rematerializing for project_id=16, view_id=54, base_view_id=1...")
    create_materialized_table(16, 54, 1)
    print("[DEBUG] Done.")
    # Optionally, you can still call refresh_all_materialized(1) for legacy/debug
    # refresh_all_materialized(1)
