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

def create_materialized_elektrik(project_id:int):

    get_active_project_articles(project_id)

    conn = psycopg2.connect(DB_URL)
    cursor = conn.cursor()
    base_view_id = 2  # Elektrik-Layout!

    # 1. Tabellenname generieren
    project_name = get_project_name(cursor, project_id)
    table_name = f"materialized_elektrik_{project_name}"

    # 2. Liste relevanter project_article_id
    ids = get_elektrik_article_ids(cursor, project_id)
    if not ids:
        print("[ELEKTRIK] Keine Artikel gefunden – Abbruch.")
        cursor.close()
        conn.close()
        return

    # 3. Hole Layout-Spalten
    cursor.execute("""
        SELECT c.name, c.display_name, vc.position
        FROM views_columns vc
        JOIN columns c ON vc.column_id = c.id
        WHERE vc.base_view_id = %s AND vc.visible = TRUE
        ORDER BY vc.position
    """, (base_view_id,))
    layout_columns = cursor.fetchall()
    layout_name_map = {}
    for name, display_name, _ in layout_columns:
        if name:
            layout_name_map[name.strip().lower()] = (display_name or name).strip()

    HEADER_MAP = json.loads(Path("backend/utils/header_name_map.json").read_text(encoding="utf-8"))

    # 4. Hole alle verfügbaren Spalten aus den Tabellen
    cursor.execute("""
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_name IN (
            'inserted_rows',
            'draft_project_articles',
            'project_articles',
            'articles'
        )
    """)
    colmap = {"i": set(), "d": set(), "p": set(), "a": set()}
    for table, col in cursor.fetchall():
        key = {
            "inserted_rows": "i",
            "draft_project_articles": "d",
            "project_articles": "p",
            "articles": "a"
        }[table]
        colmap[key].add(col)

    # 5. Erstelle die COALESCE-Spalten-Ausdrücke nur mit vorhandenen Spalten
    col_exprs = []
    output_cols = []  # Reihenfolge der finalen Output-Spalten
    col_exprs.append("main.project_article_id AS project_article_id")
    output_cols.append("project_article_id")

    # Display-Namen merken (für Header-Zeilen)
    kommentar_display = layout_name_map.get("kommentar", "Kommentar")
    einbauort_display = layout_name_map.get("einbauort", "Einbauort")

    # Merker für Einbauort-ID-Expr (Gruppierung)
    einbauort_id_txt = None
    einbauort_raw = None

    for layout_col, materialized_col in layout_name_map.items():
        if layout_col == "project_article_id":
            continue

        sources = []
        if layout_col in colmap["i"]:
            sources.append(f'ins."{layout_col}"')
        if layout_col in colmap["d"]:
            sources.append(f'dpa."{layout_col}"')
        if layout_col in colmap["p"]:
            sources.append(f'pa."{layout_col}"')
        if layout_col in colmap["a"]:
            sources.append(f'a."{layout_col}"')

        if not sources:
            continue  # keine Quelle

        layout_expr = f"COALESCE({', '.join(sources)})"

        if layout_col == "einbauort":
            # robust: '', '123', '... [123] ...'
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
                ) AS "{materialized_col}"
            """.strip()

            einbauort_id_txt = id_txt
            einbauort_raw = raw_txt
        else:
            expr = f"{layout_expr} AS \"{materialized_col}\""

        col_exprs.append(expr)
        output_cols.append(materialized_col)

    col_exprs_sql = ",\n                ".join(col_exprs)

    # Fallbacks falls 'einbauort' nicht im Layout ist
    if einbauort_id_txt is None:
        einbauort_raw = """NULLIF(TRIM((COALESCE(ins."einbauort", dpa."einbauort", pa."einbauort"))::text), '')"""
        einbauort_id_txt = f"""
            CASE
                WHEN {einbauort_raw} ~ '^[0-9]+$' THEN {einbauort_raw}
                WHEN {einbauort_raw} ~ '\\[[0-9]+\\]' THEN regexp_replace({einbauort_raw}, '.*\\[([0-9]+)\\].*', '\\1')
                ELSE NULL
            END
        """.strip()

    einbauort_full_expr = f"""
        COALESCE(
            (SELECT me.full_name
             FROM materialized_einbauorte me
             WHERE me.project_id = {project_id}
               AND me.id::text = ({einbauort_id_txt})
             LIMIT 1),
            {einbauort_raw}
        )
    """.strip()

    order_secondary_expr = 'COALESCE(ins."emsr_no", dpa."emsr_no", pa."emsr_no")'

    # Header-Select bauen (Kommentar='HEADER', Einbauort kopieren, Rest NULL::text)
    quoted_cols = [f"\"{c}\"" for c in output_cols]
    header_row_select_parts = []
    for c in output_cols:
        if c == "project_article_id":
            header_row_select_parts.append("NULL::int AS \"project_article_id\"")
        elif c == kommentar_display:
            header_row_select_parts.append(f"'HEADER'::text AS \"{c}\"")
        elif c == einbauort_display:
            header_row_select_parts.append(f"hb.\"{c}\" AS \"{c}\"")
        else:
            header_row_select_parts.append(f"NULL::text AS \"{c}\"")
    header_row_select_sql_hb = ",\n                ".join(header_row_select_parts)

    # Body-Select: alle Nicht-ID-Spalten auf ::text casten (vereinheitlicht die UNION-Typen)
    body_row_select_casted = []
    for c in output_cols:
        if c == "project_article_id":
            body_row_select_casted.append(f"b.\"{c}\"")  # int
        else:
            body_row_select_casted.append(f"(b.\"{c}\")::text AS \"{c}\"")
    body_row_select_sql = ", ".join(body_row_select_casted)

    # 6. Drop und CREATE TABLE – mit Header-Injektion
    cursor.execute(f'DROP TABLE IF EXISTS "{table_name}";')
    sql = rf'''
        CREATE TABLE "{table_name}" AS
        WITH main AS (
            SELECT ir.project_article_id, ir.relevance_etech, ir.article_id
            FROM inserted_rows ir
            WHERE ir.project_article_id = ANY(%s) AND ir.relevance_etech IN ('E','ES')
            UNION
            SELECT pa.id AS project_article_id, pa.relevance_etech, pa.article_id
            FROM project_articles pa
            JOIN articles a ON pa.article_id = a.id
            WHERE pa.id = ANY(%s) AND pa.relevance_etech IN ('E','ES')
        ),
        base_rows AS (
            SELECT
                {col_exprs_sql},
                row_number() OVER (ORDER BY {einbauort_full_expr}, {order_secondary_expr}) AS __ord,
                {einbauort_id_txt} AS __eid
            FROM main
            LEFT JOIN inserted_rows ins ON ins.project_article_id = main.project_article_id
            LEFT JOIN draft_project_articles dpa ON dpa.project_article_id = main.project_article_id
            LEFT JOIN project_articles pa ON pa.id = main.project_article_id
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
    cursor.execute(sql, (ids, ids))
    conn.commit()
    print(f"✅ Materialized Elektrik erzeugt: {table_name}")

    cursor.close()
    conn.close()

if __name__ == "__main__":
    create_materialized_elektrik(1)

# TODO: create the logic for von_sheet, to set the origin of the data
