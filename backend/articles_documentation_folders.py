import sys
import os
import json
from copy import deepcopy
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import create_engine, text
from backend.settings.connection_points import DB_URL, ARTICLE_DOCUMENTATION_PATH

def ensure_article_folders():
    os.makedirs(ARTICLE_DOCUMENTATION_PATH, exist_ok=True)
    engine = create_engine(DB_URL)
    with engine.connect() as conn:
        result = conn.execute(text("SELECT id FROM articles"))
        article_ids = [row[0] for row in result]
    with open(os.path.join("backend", "utils", "manifest_template.json"), "r", encoding="utf-8") as template_file:
        manifest_template = json.load(template_file)
    for article_id in article_ids:
        folder_name = f"article_id({article_id})"
        folder_path = os.path.join(ARTICLE_DOCUMENTATION_PATH, folder_name)
        os.makedirs(folder_path, exist_ok=True)
        manifest = deepcopy(manifest_template)
        # Replace only the X in article_id, leave everything else as in the template
        if manifest.get("article_id") == "X":
            manifest["article_id"] = str(article_id)
        manifest_path = os.path.join(folder_path, "manifest.json")
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, ensure_ascii=False, indent=2)
    print(f"Created/ensured folders and manifest.json for {len(article_ids)} articles in {ARTICLE_DOCUMENTATION_PATH}")

if __name__ == "__main__":
    ensure_article_folders()
