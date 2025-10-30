import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import psycopg2
from backend.autocad.sync_to_cad import fetch_smart_objects_for_view, map_cad_properties_to_pa, upsert_project_article, create_position_map, update_position_meta
from backend.settings.connection_points import DB_URL

def test_sync_to_cad_insert():
    pg_conn = psycopg2.connect(DB_URL)
    try:
        # Fetch smart objects
        smart_objects = fetch_smart_objects_for_view(pg_conn, project_id=16, view_id=54, debug_txt=True)
        assert isinstance(smart_objects, list)
        print(f"Fetched {len(smart_objects)} smart objects.")
        pa_ids = []
        for obj in smart_objects:
            mapped = map_cad_properties_to_pa(obj)
            pa_id = upsert_project_article(pg_conn, project_id=16, view_id=54, mapped_props=mapped)
            pa_ids.append(pa_id)
        print(f"Inserted/updated {len(pa_ids)} project_articles rows. Example pa_ids: {pa_ids[:5]}")
        # Create and update position_map
        position_map = create_position_map(pg_conn, pa_ids)
        update_position_meta(pg_conn, view_id=54, position_map=position_map)
        print(f"Position map updated for view_id=54. Example: {position_map[:5]}")
        # Optionally: check the debug file exists
        debug_path = os.path.join(os.path.dirname(__file__), "smart_objects_debug.txt")
        assert os.path.exists(debug_path)
        print(f"Debug file created at: {debug_path}")
    finally:
        pg_conn.close()

if __name__ == "__main__":
    test_sync_to_cad_insert()
