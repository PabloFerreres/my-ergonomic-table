import os
import json
from typing import Dict

PREFIXES = ["Betr", "Wart", "Kurz", "Zeich", "Daten", "Extr"]

def count_doc_meta_for_article(article_id: int, base_path: str) -> Dict[str, int]:
    """
    Count files and manifest links for each prefix in the article documentation folder.
    Only considers the article-level folder (not revision subfolders).
    Returns a dict: {prefix: count}
    """
    folder = os.path.join(base_path, f"article_id({article_id})")
    counts = {prefix: 0 for prefix in PREFIXES}
    if not os.path.isdir(folder):
        return counts

    # Count files
    for fname in os.listdir(folder):
        for prefix in PREFIXES:
            if fname.startswith(f"{prefix}__"):
                counts[prefix] += 1

    # Count manifest links
    manifest_path = os.path.join(folder, "manifest.json")
    if os.path.isfile(manifest_path):
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                manifest = json.load(f)
            links = manifest.get("links", [])
            for link in links:
                name = (link.get("name") or "")
                for prefix in PREFIXES:
                    if name.startswith(f"{prefix}__"):
                        counts[prefix] += 1
        except Exception:
            pass  # Ignore manifest errors
    return counts

def batch_update_doc_meta_for_articles(base_path: str, db_url=None):
    import psycopg2
    if db_url is None:
        from backend.settings.connection_points import DB_URL as db_url
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    cur.execute("SELECT id FROM articles")
    article_ids = [row[0] for row in cur.fetchall()]
    for aid in article_ids:
        counts = count_doc_meta_for_article(aid, base_path)
        set_clause = ", ".join([f"{prefix.lower()} = %s" for prefix in PREFIXES])
        values = [str(counts[prefix]) if counts[prefix] > 0 else '' for prefix in PREFIXES]
        cur.execute(f"UPDATE articles SET {set_clause} WHERE id = %s", values + [aid])
    conn.commit()
    cur.close()
    conn.close()

if __name__ == "__main__":
    import sys
    import json
    import os
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))
    try:
        from backend.settings.connection_points import DB_URL
    except ImportError:
        from settings.connection_points import DB_URL
    with open(os.path.join(os.path.dirname(__file__), '../../config.json'), 'r', encoding='utf-8') as f:
        _config = json.load(f)
    ARTICLE_DOCUMENTATION_PATH = _config.get('ARTICLE_DOCUMENTATION_PATH', '')
    batch_update_doc_meta_for_articles(ARTICLE_DOCUMENTATION_PATH, db_url=DB_URL)
    print("Doc meta update complete.")
