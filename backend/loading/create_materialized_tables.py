# backend/create.py

import psycopg2
from backend.settings.connection_points import DB_URL, project_id, views_to_show, DEBUG

def get_materialized_table_name(cursor, project_id, view_id):
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

def create_materialized_table(view_id, base_view_id):
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
    col_exprs.append("(pd.data->>'project_article_id')::int AS project_article_id")

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
            sources.append(f'ins.\"{layout_col}\"')
        if in_d:
            sources.append(f'dpa.\"{layout_col}\"')
        if in_p:
            sources.append(f'pa.\"{layout_col}\"')
        if in_a:
            sources.append(f'a.\"{layout_col}\"')

        layout_expr = f"COALESCE({', '.join(sources)})" if sources else "NULL"

        mapped_inserted_col = HEADER_MAP.get(layout_col, layout_col)
        in_inserted = mapped_inserted_col in colmap["i"]
        inserted_expr = f'ins.\"{mapped_inserted_col}\"' if in_inserted else "NULL"
        ai_expr = f'ai.\"{layout_col}\"' if in_ai else "NULL"
        coalesce_inserted_ai = f"COALESCE({inserted_expr}, {ai_expr})"

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
        """
        col_exprs.append(expr.strip())
    col_exprs_sql = ",\n    ".join(col_exprs)
    if DEBUG:
        print(f"[DEBUG] Column expressions:\n{col_exprs_sql}")

    # 5. Final SQL
    print(f"🧱 Creating table: {table_name}")
    cursor.execute(f'DROP TABLE IF EXISTS "{table_name}";')
    sql = f'''
        CREATE TABLE "{table_name}" AS
        WITH position_data AS (
            SELECT pm.sheet_name, item.data
            FROM position_meta pm,
                 jsonb_array_elements(pm.position_map) AS item(data)
            WHERE pm.sheet_name = '{table_name}'
        )
        SELECT
            {col_exprs_sql}
        FROM position_data pd
        LEFT JOIN project_articles pa ON pa.id = (pd.data->>'project_article_id')::int
        LEFT JOIN draft_project_articles dpa ON dpa.project_article_id = pa.id
        LEFT JOIN articles a ON pa.article_id = a.id
        LEFT JOIN inserted_rows ins ON ins.project_article_id = (pd.data->>'project_article_id')::int
        LEFT JOIN articles ai ON ins.article_id = ai.id
        ORDER BY (pd.data->>'position')::int;
    '''
    if DEBUG:
        print(f"[DEBUG] Running CREATE SQL:\n{sql}")
    cursor.execute(sql)
    conn.commit()
    print(f"✅ Created: {table_name}")
    cursor.close()
    conn.close()

def refresh_all_materialized():
    for v in views_to_show:
        if isinstance(v, dict):
            view_id = v["view_id"]
            base_view_id = v["base_view_id"]
        else:
            view_id = v
            base_view_id = None  # Not expected, fallback
        if DEBUG:
            print(f"[DEBUG] Creating materialized for view_id={view_id}, base_view_id={base_view_id}")
        create_materialized_table(view_id, base_view_id)
    print("✅ Alle Materialized Tables wurden aktualisiert.")

if __name__ == "__main__":
    refresh_all_materialized()
