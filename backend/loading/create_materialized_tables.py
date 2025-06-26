import psycopg2

DB_URL = "postgresql://myuser:1999@localhost:5432/one_project_db_milestone"
project_id = 1
base_view_id = 1

def get_view_id_from_sheet_name(sheet_name: str) -> int | None:
    conn = psycopg2.connect(DB_URL)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT v.id
        FROM views v
        JOIN project_views pv ON v.id = pv.view_id
        JOIN projects p ON pv.project_id = p.id
        WHERE LOWER(CONCAT('materialized_', v.name, '_', p.name)) = %s
    """, (sheet_name.lower(),))
    result = cursor.fetchone()
    cursor.close()
    conn.close()
    return result[0] if result else None

def get_materialized_table_name(cursor, project_id, view_id):
    cursor.execute("""
        SELECT v.name AS view_name, p.name AS project_name
        FROM views v
        JOIN project_views pv ON v.id = pv.view_id
        JOIN projects p ON pv.project_id = p.id
        WHERE v.id = %s AND p.id = %s
    """, (view_id, project_id))
    view_name, project_name = cursor.fetchone()
    return f"materialized_{view_name.lower()}_{project_name.lower()}"

def create_materialized_table(view_id):
    conn = psycopg2.connect(DB_URL)
    cursor = conn.cursor()

    table_name = get_materialized_table_name(cursor, project_id, view_id)

    # 1. Fetch visible layout columns
    cursor.execute("""
        SELECT c.name, c.display_name, vc.position
        FROM views_columns vc
        JOIN columns c ON vc.column_id = c.id
        WHERE (
            (vc.view_id = %s AND vc.project_id = %s)
            OR (vc.base_view_id = %s)
        )
        AND vc.visible = TRUE
        ORDER BY vc.position
    """, (view_id, project_id, base_view_id))
    layout_columns = cursor.fetchall()

    # Map lowercase layout name -> display (materialized column) name
    layout_name_map = {}
    for name, display_name, _ in layout_columns:
        if name:
            layout_name_map[name.strip().lower()] = (display_name or name).strip()

    # 2. Get all column names in inserted_rows
    cursor.execute("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'inserted_rows'
    """)
    inserted_col_set = {r[0].strip() for r in cursor.fetchall()}

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
        in_inserted = materialized_col in inserted_col_set

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
        inserted_expr = f'ins."{materialized_col}"' if in_inserted else "NULL"

        expr = f"""
            CASE
                WHEN (pd.data->>'project_article_id')::int > 0 THEN ({layout_expr})::text
                WHEN (pd.data->>'project_article_id')::int < 0 THEN {inserted_expr}::text
                ELSE NULL
            END AS "{materialized_col}"
        """
        col_exprs.append(expr.strip())

    col_exprs_sql = ",\n    ".join(col_exprs)

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
        ORDER BY (pd.data->>'position')::int;
    '''
    cursor.execute(sql)
    conn.commit()
    print(f"✅ Created: {table_name}")
    cursor.close()
    conn.close()

def refresh_all_materialized():
    for vid in range(1, 6):
        create_materialized_table(view_id=vid)
    print("✅ Alle Materialized Tables wurden aktualisiert.")

if __name__ == "__main__":
    refresh_all_materialized()
