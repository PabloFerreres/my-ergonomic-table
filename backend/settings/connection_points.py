from __future__ import annotations
from pathlib import Path
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import json
import os

# --- Config laden (robust, vom Repo-Root) ---
ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = ROOT / "config.json"
config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))

DB_URL: str = config["DB_URL"]
BACKEND_URL: str = config.get("BACKEND_URL", "")
# DEBUG aus ENV überschreibbar (default True wie bisher)
DEBUG: bool = (os.getenv("DEBUG", "1") == "1")

# --- CORS dynamisch aus config.json / ENV ---
# Entweder Liste exakter Origins ...
FRONTEND_ORIGINS = config.get("FRONTEND_ORIGINS")
if isinstance(FRONTEND_ORIGINS, str):
    FRONTEND_ORIGINS = [FRONTEND_ORIGINS]
if FRONTEND_ORIGINS is None:
    env = os.getenv("FRONTEND_ORIGINS")
    FRONTEND_ORIGINS = [s.strip() for s in env.split(",")] if env else ["http://localhost:5173"]

# ... oder ein Regex (z. B. "https?://(localhost|127\.0\.0\.1):5173")
FRONTEND_ORIGIN_REGEX = config.get("FRONTEND_ORIGIN_REGEX") or os.getenv("FRONTEND_ORIGIN_REGEX")

# --- Sync SQLAlchemy (dein bestehender Code) ---
engine = create_engine(DB_URL)
Session = sessionmaker(bind=engine)

def get_views_for_project(project_id: int):
    session = Session()
    try:
        sql = text("SELECT id AS view_id, base_view_id FROM views WHERE project_id = :pid")
        if DEBUG:
            print(f"[DEBUG] Running SQL: {sql}")
            print(f"[DEBUG] With project_id: {project_id}")
        res = session.execute(sql, {"pid": project_id})
        result_list = [{"view_id": row.view_id, "base_view_id": row.base_view_id} for row in res]
        if DEBUG:
            print(f"[DEBUG] Query result: {result_list}")
        return result_list
    finally:
        session.close()

def get_views_to_show(project_id: int):
    return get_views_for_project(project_id)

if DEBUG:
    print("[DEBUG] connection_points ready")
