import psycopg2
import json
from pathlib import Path
from backend.settings.connection_points import DB_URL, DEBUG

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
    col_exprs.append("main.project_article_id AS project_article_id")
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
        expr = f"{layout_expr} AS \"{materialized_col}\""
        col_exprs.append(expr)
    col_exprs_sql = ",\n    ".join(col_exprs)

    # 6. Drop und CREATE TABLE nur mit den relevanten IDs und E/ES Filter
    cursor.execute(f'DROP TABLE IF EXISTS "{table_name}";')
    sql = rf'''
        CREATE TABLE "{table_name}" AS
        SELECT {col_exprs_sql}
        FROM (
            SELECT ir.project_article_id, ir.relevance_etech, ir.article_id
            FROM inserted_rows ir
            WHERE ir.project_article_id = ANY(%s) AND ir.relevance_etech IN ('E','ES')
            UNION
            SELECT pa.id AS project_article_id, a.relevance_etech, pa.article_id
            FROM project_articles pa
            JOIN articles a ON pa.article_id = a.id
            WHERE pa.id = ANY(%s) AND a.relevance_etech IN ('E','ES')
        ) main
        LEFT JOIN inserted_rows ins ON ins.project_article_id = main.project_article_id
        LEFT JOIN draft_project_articles dpa ON dpa.project_article_id = main.project_article_id
        LEFT JOIN project_articles pa ON pa.id = main.project_article_id
        LEFT JOIN articles a ON pa.article_id = a.id
        ORDER BY
            -- 1. Prefix bis Bindestrich
            SPLIT_PART(COALESCE(ins."einbauort", dpa."einbauort", pa."einbauort"), '-', 1),
            -- 2. Nach-Bindestrich-Zahl, wenn sie eine Zahl ist, sonst NULL
            CASE
                WHEN SPLIT_PART(SPLIT_PART(COALESCE(ins."einbauort", dpa."einbauort", pa."einbauort"), ' ', 1), '-', 2) ~ '^[0-9]+(\.[0-9]+)?$'
                    THEN SPLIT_PART(SPLIT_PART(COALESCE(ins."einbauort", dpa."einbauort", pa."einbauort"), ' ', 1), '-', 2)::float
                ELSE NULL
            END,
            COALESCE(ins."einbauort", dpa."einbauort", pa."einbauort"),
            COALESCE(ins."emsr_no", dpa."emsr_no", pa."emsr_no")

    '''

    #TODO create a more precise logic for sorting with E-10 after
    if DEBUG:
        print("[ELEKTRIK] CREATE SQL:\n", sql)
    cursor.execute(sql, (ids, ids))
    conn.commit()
    print(f"✅ Materialized Elektrik erzeugt: {table_name}")

    cursor.close()
    conn.close()

if __name__ == "__main__":
    create_materialized_elektrik(1)



#TODO: create the logic for von_sheet, to set the origin of the data
