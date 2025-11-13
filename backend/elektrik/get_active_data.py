import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

import psycopg2
import json
from backend.settings.connection_points import DB_URL
from psycopg2.extras import Json   # <-- HINZUFÜGEN

def get_active_project_articles(project_id: int):
    """
    Sammelt alle project_article_id für das zentrale Projekt aus allen zugehörigen position_meta
    von NICHT-gelöschten Views (views.deleted_at IS NULL),
    speichert diese als JSON in elektrik_meta.project_articles_live (Upsert).
    """
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    # 1. Nur position_meta_id aus aktiven (nicht gelöschten) Views
    cur.execute("""
        SELECT m.position_meta_id
        FROM multiproject_meta_datas AS m
        JOIN views AS v ON v.id = m.view_id
        WHERE m.project_id = %s
          AND v.deleted_at IS NULL
    """, (project_id,))
    pos_ids = [row[0] for row in cur.fetchall()]
    if not pos_ids:
        print(f"⚠️ Keine aktiven position_meta_id für project_id={project_id}")
        cur.close()
        conn.close()
        return

    # 2. Hole alle position_map JSONs
    cur.execute("""
        SELECT position_map
        FROM position_meta
        WHERE id = ANY(%s)
    """, (pos_ids,))
    article_ids = []
    for (pos_map_json,) in cur.fetchall():
        if not pos_map_json:
            continue
        try:
            rows = json.loads(pos_map_json) if isinstance(pos_map_json, str) else pos_map_json
            ids = [row["project_article_id"] for row in rows if isinstance(row, dict) and "project_article_id" in row]
            article_ids.extend(ids)
        except Exception as e:
            print(f"⚠️ Fehler beim Parsen: {e}")

    # Filter article_ids to only those with relevance_e_tech in ('E', 'ES')
    if article_ids:
        cur.execute("""
            SELECT id FROM project_articles WHERE id = ANY(%s) AND relevance_e_tech IN ('E', 'ES')
        """, (list(set(article_ids)),))
        filtered_ids = [row[0] for row in cur.fetchall()]
        article_ids = filtered_ids

    # 3. Schreibe als JSONB in elektrik_meta
    if not article_ids:
        print(f"⚠️ Keine project_article_id gefunden für project_id={project_id}")
    else:
        article_ids = list(set(article_ids))
        cur.execute("""
            INSERT INTO elektrik_meta (project_id, project_articles_live)
            VALUES (%s, %s)
            ON CONFLICT (project_id)
            DO UPDATE SET project_articles_live = EXCLUDED.project_articles_live
        """, (project_id, Json(article_ids)))   # Json(...) → direkt als JSONB
        print(f"✅ Elektrik-Liste gespeichert für project_id={project_id}: {len(article_ids)} IDs")
        conn.commit()

    cur.close()
    conn.close()

if __name__ == "__main__":
    print("[DEBUG] Running get_active_project_articles for project_id=16...")
    get_active_project_articles(16)
    print("[DEBUG] Done.")
