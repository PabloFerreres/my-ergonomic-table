# backend/loading/create_materialized_tables.py

import psycopg2
from backend.settings.connection_points import DB_URL, get_views_to_show, DEBUG

def get_materialized_table_name(cursor, project_id: int, view_id: int):
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

def create_materialized_table(project_id:int, view_id, base_view_id):
    import json
    from pathlib import Path

    conn = psycopg2.connect(DB_URL)
    cursor = conn.cursor()

    table_name = get_materialized_table_name(cursor, project_id, view_id)
    if not table_name:
        if DEBUG:
            print(f"[DEBUG] Skipping create_materialized_table for view_id={view_id}: table name not found.")
        cursor.close()
        conn.close()
        return

    # 1. Fetch visible layout columns
    cursor.execute("""
        SELECT c.name, c.display_name, vc.position
        FROM views_columns vc
        JOIN columns c ON vc.column_id = c.id
        WHERE vc.base_view_id = %s
        AND vc.visible = TRUE
        ORDER BY vc.position
    """, (base_view_id,))
    layout_columns = cursor.fetchall()
    if DEBUG:
        print(f"[DEBUG] Layout columns for base_view_id={base_view_id}: {layout_columns}")

    # Map lowercase layout name -> display name
    layout_name_map = {}
    for name, display_name, _ in layout_columns:
        if name:
            layout_name_map[name.strip().lower()] = (display_name or name).strip()

    # Load HEADER_MAP
    HEADER_MAP = json.loads(Path("backend/utils/header_name_map.json").read_text(encoding="utf-8"))
    if DEBUG:
        print(f"[DEBUG] Loaded HEADER_MAP: {HEADER_MAP}")

    # 2. Get all column names in inserted_rows
    cursor.execute("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'inserted_rows'
    """)
    inserted_col_set = {r[0].strip() for r in cursor.fetchall()}
    if DEBUG:
        print(f"[DEBUG] inserted_rows columns: {inserted_col_set}")

    # 3. Get all available columns from all layout sources
    cursor.execute("""
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_name IN (
            'project_articles',
            'draft_project_articles',
            'articles',
            'inserted_rows'
        )
    """)
    colmap = {"d": set(), "p": set(), "a": set(), "i": set()}
    for table, col in cursor.fetchall():
        key = {
            "project_articles": "p",
            "draft_project_articles": "d",
            "articles": "a",
            "inserted_rows": "i"
        }[table]
        colmap[key].add(col)
    colmap["ai"] = colmap["a"]  # NEU: ai wie a
    if DEBUG:
        print(f"[DEBUG] colmap: {colmap}")

    # 4. Build column expressions from layout
    col_exprs = []
    output_cols = []  # Reihenfolge der finalen Output-Spalten
    col_exprs.append("(pd.data->>'project_article_id')::int AS project_article_id")
    output_cols.append("project_article_id")

    # Wir merken uns, wie die Display-Namen der wichtigen Spalten heißen
    kommentar_display = layout_name_map.get("kommentar", "Kommentar")
    einbauort_display = layout_name_map.get("einbauort", "Einbauort")

    # Einbauort-ID-Expr (als Text) für interne Gruppenerkennung (Header-Einfügen)
    einbauort_id_text_expr = None

    for layout_col, materialized_col in layout_name_map.items():
        if layout_col == "project_article_id":
            continue

        in_i = layout_col in colmap["i"]
        in_d = layout_col in colmap["d"]
        in_p = layout_col in colmap["p"]
        in_a = layout_col in colmap["a"]
        in_ai = layout_col in colmap["ai"]

        sources = []
        if in_i:
            sources.append(f'ins."{layout_col}"')
        if in_d:
            sources.append(f'dpa."{layout_col}"')
        if in_p:
            sources.append(f'pa."{layout_col}"')
        if in_a:
            sources.append(f'a."{layout_col}"')

        layout_expr = f"COALESCE({', '.join(sources)})" if sources else "NULL"

        mapped_inserted_col = HEADER_MAP.get(layout_col, layout_col)
        in_inserted = mapped_inserted_col in colmap["i"]
        inserted_expr = f'ins."{mapped_inserted_col}"' if in_inserted else "NULL"
        ai_expr = f'ai."{layout_col}"' if in_ai else "NULL"
        coalesce_inserted_ai = f"COALESCE({inserted_expr}, {ai_expr})"

        if layout_col == "einbauort":
            # TEXT-Varianten für ID (als Text) aufbereiten
            to_txt_layout   = f"NULLIF(TRIM(({layout_expr})::text), '')"
            to_txt_inserted = f"NULLIF(TRIM(({inserted_expr})::text), '')"
            to_txt_coalesce = f"NULLIF(TRIM(({coalesce_inserted_ai})::text), '')"

            id_text_expr = f"""
                CASE
                    WHEN (pd.data->>'project_article_id')::int > 0 THEN {to_txt_layout}
                    WHEN (pd.data->>'project_article_id')::int < 0 THEN 
                        CASE
                            WHEN ins.article_id IS NOT NULL THEN {to_txt_coalesce}
                            ELSE {to_txt_inserted}
                        END
                    ELSE NULL
                END
            """.strip()

            # Merken für Gruppierung
            einbauort_id_text_expr = id_text_expr

            # sichtbarer Wert = full_name
            expr = f"""
                (
                    SELECT me.full_name
                    FROM materialized_einbauorte me
                    WHERE me.project_id = {project_id}
                      AND me.id::text = {id_text_expr}
                ) AS "{materialized_col}"
            """.strip()
        else:
            expr = f"""
                CASE
                    WHEN (pd.data->>'project_article_id')::int > 0 THEN ({layout_expr})::text
                    WHEN (pd.data->>'project_article_id')::int < 0 THEN 
                        CASE
                            WHEN ins.article_id IS NOT NULL THEN {coalesce_inserted_ai}::text
                            ELSE {inserted_expr}::text
                        END
                    ELSE NULL
                END AS "{materialized_col}"
            """.strip()

        col_exprs.append(expr)
        output_cols.append(materialized_col)

    col_exprs_sql = ",\n    ".join(col_exprs)
    if DEBUG:
        print(f"[DEBUG] Column expressions:\n{col_exprs_sql}")

    # 5. Final SQL mit Header-Zeilen (Kommentar='HEADER' & Einbauort=full_name)
    #    base_rows liefert Daten + __pos + __eid; danach body und headers.
    quoted_cols = [f"\"{c}\"" for c in output_cols]

    # Header-Select-Zeile für Alias b
    header_row_select_parts = []
    for c in output_cols:
        if c == "project_article_id":
            header_row_select_parts.append("NULL::int AS \"project_article_id\"")
        elif c == kommentar_display:
            header_row_select_parts.append(f"'HEADER'::text AS \"{c}\"")
        elif c == einbauort_display:
            header_row_select_parts.append(f"b.\"{c}\" AS \"{c}\"")
        else:
            header_row_select_parts.append(f"NULL::text AS \"{c}\"")
    header_row_select_sql = ",\n            ".join(header_row_select_parts)

    # gleiche Select-Zeile, aber für Alias hb (headers_base)
    header_row_select_sql_hb = header_row_select_sql.replace('b."', 'hb."')

    body_row_select_sql = ", ".join([f"b.{qc}" for qc in quoted_cols])
    eid_sql = einbauort_id_text_expr if einbauort_id_text_expr else "NULL"

    if DEBUG:
        print(f"[DEBUG] Will inject header rows (Kommentar='HEADER') using __eid derived: {einbauort_id_text_expr is not None}")

    print(f"🧱 Creating table: {table_name}")
    cursor.execute(f'DROP TABLE IF EXISTS \"{table_name}\";')
    sql = f'''
        CREATE TABLE "{table_name}" AS
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
                {eid_sql} AS __eid
            FROM position_data pd
            LEFT JOIN project_articles pa ON pa.id = (pd.data->>'project_article_id')::int
            LEFT JOIN draft_project_articles dpa ON dpa.project_article_id = pa.id
            LEFT JOIN articles a ON pa.article_id = a.id
            LEFT JOIN inserted_rows ins ON ins.project_article_id = (pd.data->>'project_article_id')::int
            LEFT JOIN articles ai ON ins.article_id = ai.id
        ),
        body AS (
            SELECT
                {body_row_select_sql},
                __pos AS order_key
            FROM base_rows b
        ),
        headers_base AS (
            SELECT
                b.*,
                LAG(b.__eid) OVER (ORDER BY b.__pos) AS prev_eid
            FROM base_rows b
        ),
        headers AS (
            -- Header nur erzeugen, wenn wir eine __eid haben und ein Wechsel vorliegt
            SELECT
                {header_row_select_sql_hb},
                (hb.__pos - 0.5)::numeric AS order_key
            FROM headers_base hb
            WHERE
                hb.__eid IS NOT NULL
                AND (hb.prev_eid IS NULL OR hb.__eid IS DISTINCT FROM hb.prev_eid)
        )
        SELECT * FROM (
            SELECT * FROM headers
            UNION ALL
            SELECT * FROM body
        ) u
        ORDER BY u.order_key;
    '''
    if DEBUG:
        print(f"[DEBUG] Running CREATE SQL:\n{sql}")
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
    refresh_all_materialized(1)
