# backend/setting/connection_points.py

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

DB_URL = "postgresql://myuser:1999@localhost:5432/mini_project_milestone"
project_id = 2
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

views_to_show = get_views_for_project(project_id)

if DEBUG:
    print(f"[DEBUG] views_to_show: {views_to_show}")
