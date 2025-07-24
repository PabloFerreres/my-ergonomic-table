import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

import psycopg2
import json
from backend.settings.connection_points import DB_URL
from psycopg2.extras import Json   # <-- HINZUFÜGEN

def get_active_project_articles(project_id: int):
    """
    Sammelt alle project_article_id für das zentrale Projekt aus allen zugehörigen position_meta,
    speichert diese als JSON in elektrik_meta.project_articles_live,
    und trägt project_id korrekt ein (Upsert).
    """
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    # 1. Hole alle position_meta_id für das Projekt
    cur.execute("""
        SELECT position_meta_id
        FROM multiproject_meta_datas
        WHERE project_id = %s
    """, (project_id,))
    pos_ids = [row[0] for row in cur.fetchall()]
    if not pos_ids:
        print(f"⚠️ Keine position_meta_id für project_id={project_id}")
        cur.close()
        conn.close()
        return

    # 2. Hole alle position_map JSONS
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
            if isinstance(pos_map_json, str):
                rows = json.loads(pos_map_json)
            else:
                rows = pos_map_json
            ids = [row["project_article_id"] for row in rows if "project_article_id" in row]
            article_ids.extend(ids)
        except Exception as e:
            print(f"⚠️ Fehler beim Parsen: {e}")

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
        """, (project_id, Json(article_ids)))   # <-- Hier: KEIN dumps, sondern Json(article_ids)
        print(f"✅ Elektrik-Liste gespeichert für project_id={project_id}: {len(article_ids)} IDs")
        conn.commit()

    cur.close()
    conn.close()

if __name__ == "__main__":
    get_active_project_articles(1)
