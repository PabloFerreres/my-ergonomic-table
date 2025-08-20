from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import json
import os

config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '..', 'config.json')
with open(config_path, 'r') as f:
    config = json.load(f)

DB_URL = config["DB_URL"]
DEBUG = True  # Debug-Ausgaben aktivieren/deaktivieren

engine = create_engine(DB_URL)
Session = sessionmaker(bind=engine)

def get_views_for_project(project_id):
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

def get_views_to_show(project_id):
    return get_views_for_project(project_id)

# Kein globales views_to_show mehr!

if DEBUG:
    print(f"[DEBUG] connection_points ready")
