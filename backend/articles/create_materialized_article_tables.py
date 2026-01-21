# backend/articles/create_materialized_article_tables.py

"""
Materializes two article tables for visualization, including revisions as rows below their articles.
- Uses base_view_id 5 and 6 for column selection/order.
- Sources: articles (main), article_revisions (deltas).
- No header_rows logic.
- Each article row is followed by its revisions, which inherit and override data from the previous version.
"""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import psycopg2
from backend.settings.connection_points import DB_URL, DEBUG
from backend.utils.doc_meta_counter import count_doc_meta_for_article, batch_update_doc_meta_for_articles
import json

with open(os.path.join(os.path.dirname(__file__), '../../config.json'), 'r', encoding='utf-8') as f:
    _config = json.load(f)
ARTICLE_DOCUMENTATION_PATH = _config.get('ARTICLE_DOCUMENTATION_PATH', '')

def get_article_columns(cursor, base_view_id):
    """Get (internal_name, external_name) for the given base_view_id, ordered."""
    cursor.execute("""
        SELECT c.name, c.name_external_german, vc.position
        FROM views_columns_auto vc
        JOIN columns c ON vc.column_id = c.id
        WHERE vc.base_view_id = %s AND vc.visible = TRUE
        ORDER BY vc.position
    """, (base_view_id,))
    return [(row[0], row[1] or row[0]) for row in cursor.fetchall()]

def create_materialized_article_table(project_id: int, base_view_id: int, table_name: str):
    conn = psycopg2.connect(DB_URL)
    cursor = conn.cursor()
    columns = get_article_columns(cursor, base_view_id)  # List of (internal, external)
    internal_names = [col[0] for col in columns]
    external_names = [col[1] for col in columns]
    col_exprs = ', '.join([f'"{col}"' for col in external_names])

    # 1. Get all articles (no project_id filter)
    cursor.execute("SELECT * FROM articles LIMIT 0;")
    if cursor.description:
        article_cols = [desc[0] for desc in cursor.description]
    else:
        article_cols = []
    # Filter articles by article_typ based on base_view_id
    if base_view_id == 5:
        cursor.execute("SELECT * FROM articles WHERE article_typ = 'Motor' ORDER BY id ASC")
    elif base_view_id == 6:
        cursor.execute("SELECT * FROM articles WHERE article_typ != 'Motor' OR article_typ IS NULL ORDER BY id ASC")
    else:
        cursor.execute("SELECT * FROM articles ORDER BY id ASC")
    articles = cursor.fetchall()
    if articles and article_cols:
        article_map = {a[article_cols.index('id')]: dict(zip(article_cols, a)) for a in articles}
    else:
        article_map = {}

    # 2. Get all revisions, sorted by article_id, then rev_char (no project_id filter)
    cursor.execute("SELECT * FROM article_revisions LIMIT 0;")
    if cursor.description:
        rev_cols = [desc[0] for desc in cursor.description]
    else:
        rev_cols = []
    # Filter revisions by article_typ based on base_view_id
    if base_view_id == 5:
        cursor.execute("SELECT * FROM article_revisions WHERE article_typ = 'Motor' ORDER BY article_id ASC, rev_char ASC")
    elif base_view_id == 6:
        cursor.execute("SELECT * FROM article_revisions WHERE article_typ != 'Motor' OR article_typ IS NULL ORDER BY article_id ASC, rev_char ASC")
    else:
        cursor.execute("SELECT * FROM article_revisions ORDER BY article_id ASC, rev_char ASC")
    revisions = cursor.fetchall()
    if revisions and rev_cols:
        rev_map = {}
        for rev in revisions:
            aid = rev[rev_cols.index('article_id')]
            rev_map.setdefault(aid, []).append(dict(zip(rev_cols, rev)))
    else:
        rev_map = {}

    # Before building rows, update doc meta for all articles in the DB (can be slow)
    batch_update_doc_meta_for_articles(ARTICLE_DOCUMENTATION_PATH)

    # 3. Build rows: article, then its revisions (each inherits previous)
    rows = []
    for aid in sorted(article_map.keys()):
        base = article_map[aid].copy()
        # Always set article_id to the original article's id
        base['article_id'] = aid
        base['article_revision_char'] = None  # No revision for base article
        # Now, betr, wart, etc. columns are already updated in the DB by the batch process
        rows.append([base.get(col) if col != 'article_id' else aid for col in internal_names])
        prev = base.copy()
        for rev in rev_map.get(aid, []):
            new_row = prev.copy()
            new_row.update({k: v for k, v in rev.items() if k in internal_names and v is not None})
            new_row['article_id'] = aid  # Always set article_id to the original article's id
            # Set article_revision_char from rev_char if present
            new_row['article_revision_char'] = rev.get('rev_char') if 'rev_char' in rev else None
            rows.append([new_row.get(col) if col != 'article_id' else aid for col in internal_names])
            prev = new_row

    # 4. Create table and insert rows (use external names)
    cursor.execute(f'DROP TABLE IF EXISTS "{table_name}";')
    col_defs = ', '.join([f'"{col}" TEXT' for col in external_names])
    cursor.execute(f'CREATE TABLE "{table_name}" ({col_defs});')
    for row in rows:
        placeholders = ', '.join(['%s'] * len(row))
        cursor.execute(f'INSERT INTO "{table_name}" VALUES ({placeholders});', row)
    conn.commit()
    if DEBUG:
        print(f"[DEBUG] Created {table_name} with {len(rows)} rows and columns: {external_names}")
    cursor.close()
    conn.close()

def materialize_articles_for_visualizer(project_id: int):
    # Table names can be e.g. materialized_article_viz_5, materialized_article_viz_6
    create_materialized_article_table(project_id, 5, f"materialized_article_viz_5")
    create_materialized_article_table(project_id, 6, f"materialized_article_viz_6")

if __name__ == "__main__":
    # Example usage: rematerialize for project_id=1
    materialize_articles_for_visualizer(1)
