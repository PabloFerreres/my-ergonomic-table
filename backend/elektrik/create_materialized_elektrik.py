import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

import psycopg2
import json
from pathlib import Path
from backend.settings.connection_points import DB_URL, DEBUG
from backend.elektrik.get_active_data import get_active_project_articles


def get_elektrik_article_ids(cursor, project_id):
    cursor.execute("""
        SELECT project_articles_live FROM elektrik_meta WHERE project_id = %s
    """, (project_id,))
    row = cursor.fetchone()
    if not row or not row[0]:
        return []
    # jsonb → Python-Liste, manchmal ist es schon eine Liste
    return list(set(row[0] if isinstance(row[0], list) else json.loads(row[0])))


def get_project_name(cursor, project_id):
    cursor.execute("SELECT name FROM projects WHERE id = %s", (project_id,))
    row = cursor.fetchone()
    if not row:
        raise Exception("Kein project_name gefunden!")
    return row[0].lower()


def create_materialized_elektrik(project_id: int, debug: bool = False):
    global DEBUG
    old_debug = DEBUG
    DEBUG = debug

    debug_path = os.path.join(os.path.dirname(__file__), "debug_elektrik.txt")
    with open(debug_path, "a", encoding="utf-8") as dbg:
        dbg.write(f"\n--- Rematerialize Elektrik ---\n")
        dbg.write(f"project_id: {project_id}\n")

    get_active_project_articles(project_id)

    conn = psycopg2.connect(DB_URL)
    cursor = conn.cursor()
    base_view_id = 2  # Elektrik-Layout!

    # 1. Tabellenname generieren
    project_name = get_project_name(cursor, project_id)
    table_name = f"materialized_elektrik_{project_name}"

    # 2. Liste relevanter project_article_id
    ids = get_elektrik_article_ids(cursor, project_id)
    if DEBUG:
        print(f"[DEBUG] Elektrik IDs read from elektrik_meta for project {project_id}: {ids}")
    with open(debug_path, "a", encoding="utf-8") as dbg:
        dbg.write(f"project_articles_live: {ids}\n")
    if not ids:
        print("[ELEKTRIK] Keine Artikel gefunden – Abbruch.")
        with open(debug_path, "a", encoding="utf-8") as dbg:
            dbg.write("No IDs found, aborting.\n")
        cursor.close()
        conn.close()
        DEBUG = old_debug
        return

    try:
        # 3. Hole Layout-Spalten
        cursor.execute("""
            SELECT c.name, c.name_external_german, vc.position
            FROM views_columns vc
            JOIN columns c ON vc.column_id = c.id
            WHERE vc.base_view_id = %s AND vc.visible = TRUE
            ORDER BY vc.position
        """, (base_view_id,))
        layout_columns = cursor.fetchall()
        layout_name_map = {}
        for name, name_external_german, _ in layout_columns:
            if name:
                layout_name_map[name.strip().lower()] = (name_external_german or name).strip()

        HEADER_MAP = json.loads(
            Path("backend/utils/header_name_map.json").read_text(encoding="utf-8")
        )

        # 4. Hole alle verfügbaren Spalten aus den Tabellen
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

        # 5. Erstelle die COALESCE-Spalten-Ausdrücke nur mit vorhandenen Spalten
        col_exprs = []
        output_cols = []  # Reihenfolge der finalen Output-Spalten
        col_exprs.append("main.project_article_id AS project_article_id")
        output_cols.append("project_article_id")

        kommentar_display = layout_name_map.get("kommentar", "Kommentar")
        einbauort_display = layout_name_map.get("einbauort", "Einbauort")
        einbauort_id_txt = None
        einbauort_raw = None

        for layout_col, materialized_col in layout_name_map.items():
            if layout_col == "project_article_id":
                continue
            sources = []
            in_p = layout_col in colmap["p"]
            in_ad = layout_col in colmap["ad"]
            in_a = layout_col in colmap["a"]
            # Prioritize: if article_id exists, use articles; else use article_drafts
            if in_p:
                sources.append(f'pa."{layout_col}"')
            if in_a or in_ad:
                expr = f"CASE\n                WHEN pa.article_id IS NOT NULL THEN a.\"{layout_col}\"\n                ELSE ad.\"{layout_col}\"\n            END"
                sources.append(expr)
            if not sources:
                continue  # keine Quelle
            layout_expr = f"COALESCE({', '.join(sources)})"
            if layout_col == "einbauort":
                raw_txt = f"NULLIF(TRIM(({layout_expr})::text), '')"
                id_txt = f"""
                    CASE
                    WHEN {raw_txt} ~ '^[0-9]+$' THEN {raw_txt}
                    WHEN {raw_txt} ~ '\\[[0-9]+\\]' THEN regexp_replace({raw_txt}, '.*\\[([0-9]+)\\].*', '\\1')
                    ELSE NULL
                    END
                """.strip()
                expr = f"""
                    COALESCE(
                        (
                            SELECT me.full_name
                            FROM materialized_einbauorte me
                            WHERE me.project_id = {project_id}
                              AND me.id::text = ({id_txt})
                            LIMIT 1
                        ),
                        {raw_txt}
                    ) AS \"{materialized_col}\"
                """.strip()
                einbauort_id_txt = id_txt
                einbauort_raw = raw_txt
            else:
                expr = f'{layout_expr} AS "{materialized_col}"'
            col_exprs.append(expr)
            output_cols.append(materialized_col)

        col_exprs_sql = ",\n                ".join(col_exprs)

        # Fallbacks falls 'einbauort' nicht im Layout ist
        if einbauort_id_txt is None:
            einbauort_id_txt = (
                'CASE '
                f"WHEN NULLIF(TRIM((COALESCE(pa.\"einbauort\", ad.\"einbauort\", a.\"einbauort\"))::text), '') ~ '^[0-9]+$' "
                f"THEN NULLIF(TRIM((COALESCE(pa.\"einbauort\", ad.\"einbauort\", a.\"einbauort\"))::text), '') "
                f"WHEN NULLIF(TRIM((COALESCE(pa.\"einbauort\", ad.\"einbauort\", a.\"einbauort\"))::text), '') ~ '\\[[0-9]+\\]' "
                f"THEN regexp_replace(NULLIF(TRIM((COALESCE(pa.\"einbauort\", ad.\"einbauort\", a.\"einbauort\"))::text), ''), '.*\\[([0-9]+)\\].*', '\\1') "
                'ELSE NULL END'
            )
            einbauort_fallback_sql = (
                'NULLIF(TRIM((COALESCE(pa."einbauort", ad."einbauort", a."einbauort"))::text), \'\')'
            )
        else:
            einbauort_fallback_sql = 'NULL'

        einbauort_full_expr = f"""
            COALESCE(
                (SELECT me.full_name
                 FROM materialized_einbauorte me
                 WHERE me.project_id = {project_id}
                   AND me.id::text = ({einbauort_id_txt})
                 LIMIT 1),
                {einbauort_fallback_sql}
            )
        """.strip()

        order_secondary_expr = 'pa."emsr_no"'

        # Header-Select bauen (Kommentar='HEADER', Einbauort kopieren, Rest NULL::text)
        quoted_cols = [f'"{c}"' for c in output_cols]
        header_row_select_parts = []
        for c in output_cols:
            if c == "project_article_id":
                header_row_select_parts.append('NULL::int AS "project_article_id"')
            elif c == kommentar_display:
                header_row_select_parts.append(f"'HEADER'::text AS \"{c}\"")
            elif c == einbauort_display:
                header_row_select_parts.append(f"hb.\"{c}\" AS \"{c}\"")
            else:
                header_row_select_parts.append(f'NULL::text AS "{c}"')
        header_row_select_sql_hb = ",\n                ".join(header_row_select_parts)

        # Body-Select: alle Nicht-ID-Spalten auf ::text casten (vereinheitlicht die UNION-Typen)
        body_row_select_casted = []
        for c in output_cols:
            if c == "project_article_id":
                body_row_select_casted.append(f'b."{c}"')  # int
            else:
                body_row_select_casted.append(f'(b."{c}")::text AS "{c}"')
        body_row_select_sql = ", ".join(body_row_select_casted)

        # 6. Drop und CREATE TABLE – mit Header-Injektion
        cursor.execute(f'DROP TABLE IF EXISTS "{table_name}";')
        sql = rf'''
            CREATE TABLE "{table_name}" AS
            WITH main AS (
                SELECT pa.id AS project_article_id, pa.relevance_e_tech, pa.article_id
                FROM project_articles pa
                WHERE pa.id = ANY(%s) AND pa.relevance_e_tech IN ('E','ES')
            ),
            base_rows AS (
                SELECT
                    {col_exprs_sql},
                    row_number() OVER (ORDER BY {einbauort_full_expr}, {order_secondary_expr}) AS __ord,
                    {einbauort_id_txt} AS __eid
                FROM main
                LEFT JOIN project_articles pa ON pa.id = main.project_article_id
                LEFT JOIN article_drafts ad ON ad.project_article_id = main.project_article_id
                LEFT JOIN articles a ON pa.article_id = a.id
            ),
            body AS (
                SELECT
                    {body_row_select_sql},
                    __ord::numeric AS order_key
                FROM base_rows b
            ),
            headers_base AS (
                SELECT
                    b.*,
                    LAG(b.__eid) OVER (ORDER BY b.__ord) AS prev_eid
                FROM base_rows b
            ),
            headers AS (
                SELECT
                    {header_row_select_sql_hb},
                    (hb.__ord - 0.5)::numeric AS order_key
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
            print("[ELEKTRIK] CREATE SQL:\n", sql)
        cursor.execute(sql, (ids,))
        conn.commit()  # Ensure commit after table creation
    except Exception as e:
        with open(debug_path, "a", encoding="utf-8") as dbg:
            dbg.write(f"ERROR during table creation/commit: {e}\n")
        print(f"[ERROR] Elektrik rematerialization failed: {e}")
        conn.rollback()
    # After table creation, print output row count and sample
    try:
        cursor.execute(f'SELECT COUNT(*) FROM "{table_name}"')
        out_count_row = cursor.fetchone()
        out_count = out_count_row[0] if out_count_row else 0
        cursor.execute(f'SELECT * FROM "{table_name}" LIMIT 5')
        out_sample = cursor.fetchall() or []
    except Exception as e:
        out_count = 'ERROR'
        out_sample = f'ERROR: {e}'
    with open(debug_path, "a", encoding="utf-8") as dbg:
        dbg.write(f"Output row count: {out_count}\n")
        dbg.write(f"Output sample: {out_sample}\n")
    cursor.close()
    conn.close()
    DEBUG = old_debug
    # Optional: short delay to ensure DB visibility (uncomment if needed)
    # import time; time.sleep(0.2)


if __name__ == "__main__":
    # Debug function: rematerialize for project_id=16
    print("[DEBUG] Rematerializing Elektrik for project_id=16...")
    create_materialized_elektrik(16, debug=True)
    print("[DEBUG] Done.")

# TODO: create the logic for von_sheet, to set the origin of the data
