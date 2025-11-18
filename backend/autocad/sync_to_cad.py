import psycopg2
import sqlite3
import os
import json
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
from backend.autocad.fetch_smart_objects import fetch_smart_objects_for_drawing

def fetch_smart_objects_for_view(pg_conn, project_id: int, view_id: int, debug_txt: bool = True):
    """
    Uses fetch_smart_objects_for_drawing as the core logic for fetching smart objects from CAD DB.
    1. Get CAD DB path and drawing guid from Postgres
    2. Find PnPID for the drawing guid
    3. Use fetch_smart_objects_for_drawing to get objects
    4. Optionally write debug output
    """
    cur = pg_conn.cursor()
    cur.execute("""
        SELECT p.project_cad_db_path, v.cad_drawing_guid, v.base_view_id
        FROM projects p
        JOIN views v ON v.project_id = p.id
        WHERE p.id = %s AND v.id = %s
    """, (project_id, view_id))
    row = cur.fetchone()
    if not row:
        raise Exception("Project or view not found, or missing CAD DB path/guid")
    db_path, drawing_guid, base_view_id = row
    print(f"[DEBUG] base_view_id: {base_view_id}")
    db_path = db_path.strip('"')
    if not drawing_guid.startswith('{'):
        drawing_guid = '{' + drawing_guid
    if not drawing_guid.endswith('}'):
        drawing_guid = drawing_guid + '}'
    if not os.path.exists(db_path):
        raise Exception(f"CAD DB file does not exist: {db_path}")
    # Find PnPID for the drawing guid
    cad_conn = sqlite3.connect(db_path)
    cursor = cad_conn.cursor()
    cursor.execute("SELECT PnPID FROM PnPDrawings WHERE PnPDrawingGuid = ?", (drawing_guid,))
    pnp_row = cursor.fetchone()
    cad_conn.close()
    if not pnp_row:
        raise Exception("Drawing guid not found in Plant 3D DB")
    pnpid = pnp_row[0]
    # Get source table name from base_views
    cur.execute("SELECT cad_object_overclass_name FROM base_views WHERE id = %s", (base_view_id,))
    source_row = cur.fetchone()
    print(f"[DEBUG] source_row: {source_row}")
    if not source_row:
        raise Exception(f"base_view_id {base_view_id} not found in base_views")
    source_table = source_row[0]
    print(f"[DEBUG] source_table: {source_table}")
    # Patch DB_PATH for fetch_smart_objects_for_drawing
    import backend.autocad.fetch_smart_objects as fso
    fso.DB_PATH = db_path
    results = fetch_smart_objects_for_drawing(pnpid, source_table)
    if debug_txt:
        debug_path = os.path.join(os.path.dirname(__file__), "smart_objects_debug.txt")
        with open(debug_path, "w", encoding="utf-8") as f:
            f.write(json.dumps(results, indent=2, ensure_ascii=False))
    return results

def map_cad_properties_to_pa(obj, pg_conn):
    """
    Maps a CAD object dictionary to a dict of project_articles columns using the actual columns of the project_articles table.
    Only properties present in both CAD object and project_articles columns are mapped (case-insensitive).
    Special logic for relevance_e_tech, soll_eigenschaften, and always sets pnpguid from GUID if present.
    """
    cur = pg_conn.cursor()
    # Get column names from project_articles table
    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'project_articles'")
    pa_columns = set(row[0].lower() for row in cur.fetchall())
    cad_keys = set(k.lower() for k in obj.keys())
    intersect_keys = cad_keys & pa_columns

    result = {}
    debug_log = []
    # Map only CAD properties that exist in both CAD and project_articles columns (case-insensitive)
    for cad_prop, val in obj.items():
        col_name = cad_prop.lower()
        # Only map if in intersection and not a special column
        if col_name in intersect_keys and col_name not in ["relevance_e_tech", "soll_eigenschaften", "pnpguid"]:
            # Special handling for EinbauortID and Einbauort
            if col_name == "einbauortid" or col_name == "einbauort":
                if val is not None:
                    try:
                        # If it's a string and represents a number, convert to int
                        if isinstance(val, str):
                            num_val = val[:-2] if val.endswith(".0") else val
                            if num_val.replace('.', '', 1).isdigit():
                                val = int(float(num_val))
                        elif isinstance(val, float):
                            val = int(val)
                    except Exception:
                        pass  # If conversion fails, keep original value
            result[col_name] = val
    # Always set pnpguid from GUID if present
    if "pnpguid" in pa_columns and "GUID" in obj:
        result["pnpguid"] = obj["GUID"]
    debug_log.append(f"Direct property mapping result: {result}")

    # Special logic for relevance_e_tech (E1/E2 boolean logic)
    # Use 'relevance_e_tech' and 'Safety' (capital S) from CAD object
    E1 = obj.get('relevance_e_tech')
    E2 = obj.get('Safety')
    debug_log.append(f"Incoming CAD data: relevance_e_tech={E1}, Safety={E2}")
    E1_bool = bool(E1) and E1 != 0
    E2_bool = bool(E2) and E2 != 0
    E3 = ""
    if E1_bool and E2_bool:
        E3 = "ES"
    elif E1_bool and not E2_bool:
        E3 = "E"
    elif not E1_bool and not E2_bool:
        E3 = ""
    result['relevance_e_tech'] = E3
    debug_log.append(f"Injected relevance_e_tech value: {E3}")
    debug_log.append(f"Final result mapping: {result}")

    # Special logic for soll_eigenschaften: join soll_einstellung and soll_einstellung_einheit
    soll_einstellung = obj.get('soll_einstellung')
    soll_einstellung_einheit = obj.get('soll_einstellung_einheit')
    if (soll_einstellung is not None or soll_einstellung_einheit is not None) and "soll_eigenschaften" in pa_columns:
        joined = f"{soll_einstellung or ''} {soll_einstellung_einheit or ''}".strip()
        result['soll_eigenschaften'] = joined
        debug_log.append(f"Set soll_eigenschaften: {joined}")

    debug_log.append(f"Final result mapping: {result}")

    # Write debug log to file
    debug_path = os.path.join(os.path.dirname(__file__), "sync_debug.txt")
    with open(debug_path, "a", encoding="utf-8") as f:
        for line in debug_log:
            f.write(line + "\n")

    return result

def debug_sync_payload(mapped_props):
    """
    Debug utility: Write the payload that will be sent to upsert_project_article to a file for inspection.
    """
    debug_path = os.path.join(os.path.dirname(__file__), "sync_payload_debug.txt")
    with open(debug_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(mapped_props, indent=2, ensure_ascii=False) + "\n")

def upsert_project_article(pg_conn, project_id, view_id, mapped_props):
    """
    Checks if a project_articles row exists with pnpguid = mapped_props['pnpguid'].
    If yes, updates the row with mapped_props.
    If no, inserts a new row with mapped_props, project_id, and view_id.
    Returns the pa_id (id) of the row.
    """
    cur = pg_conn.cursor()
    guid = mapped_props.get('pnpguid')
    if not guid:
        raise Exception('No GUID found in mapped properties')
    # Remove 'id' from mapped_props if present
    mapped_props = {k: v for k, v in mapped_props.items() if k != 'id'}
    # Check for existing row
    cur.execute("SELECT id FROM project_articles WHERE pnpguid = %s", (guid,))
    row = cur.fetchone()
    if row:
        pa_id = row[0]
        set_clause = ', '.join([f"{col} = %s" for col in mapped_props.keys()])
        values = list(mapped_props.values())
        cur.execute(f"UPDATE project_articles SET {set_clause} WHERE id = %s", values + [pa_id])
    else:
        cols = ["project_id", "view_id"] + list(mapped_props.keys())
        vals = [project_id, view_id] + list(mapped_props.values())
        placeholders = ', '.join(['%s'] * len(vals))
        cur.execute(f"INSERT INTO project_articles ({', '.join(cols)}) VALUES ({placeholders}) RETURNING id", vals)
        pa_id = cur.fetchone()[0]
    pg_conn.commit()
    return pa_id

def debug_cad_to_db_properties(cad_obj, pg_conn):
    """
    Debug utility: Print all property names from CAD (all keys, lowercased), all DB property names (project_articles columns), and the intersection (those we will use).
    For CAD, show all keys in the object (lowercased). For DB, show all project_articles columns. Intersection: those present in both.
    """
    cur = pg_conn.cursor()
    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'project_articles'")
    db_names = set([row[0].lower() for row in cur.fetchall()])
    cad_names = set([k.strip().lower() for k in cad_obj.keys()])
    print("All property names from CAD (lowercased):")
    for k in cad_obj.keys():
        print(f"  - {k.strip().lower()}")
    print("\nAll property names from DB (project_articles columns):")
    for name in db_names:
        print(f"  - {name}")
    print("\nProperties that will be used (intersection):")
    for cad_name in cad_names:
        if cad_name in db_names:
            print(f"  - CAD: '{cad_name}' -> DB column: '{cad_name}'")
    return

def upsert_position_map(pg_conn, view_id, pa_ids):
    """
    Creates or updates the position_map in position_meta for the given view_id.
    Only uses the pa_ids from the current sync request, ordered by emsr_no.
    """
    cur = pg_conn.cursor()
    # Get position_meta_id for the view
    cur.execute("SELECT position_meta_id FROM views WHERE id = %s", (view_id,))
    row = cur.fetchone()
    if not row:
        raise Exception(f"No position_meta_id found for view_id={view_id}")
    position_meta_id = row[0]
    # Build position_map
    debug_path = os.path.join(os.path.dirname(__file__), "sync_debug.txt")
    with open(debug_path, "a", encoding="utf-8") as f:
        f.write(f"upsert_position_map input pa_ids: {pa_ids}\n")
    format_ids = ','.join(['%s'] * len(pa_ids))
    cur.execute(f"SELECT id, emsr_no FROM project_articles WHERE id IN ({format_ids})", pa_ids)
    rows = cur.fetchall()
    emsr_map = {row[0]: row[1] for row in rows}
    sorted_pa_ids = sorted(pa_ids, key=lambda pid: (emsr_map.get(pid) is None, emsr_map.get(pid)))
    position_map = []
    for idx, pa_id in enumerate(sorted_pa_ids, start=1):
        position_map.append({"position": idx, "project_article_id": pa_id})
    with open(debug_path, "a", encoding="utf-8") as f:
        f.write(f"upsert_position_map result position_map: {json.dumps(position_map, ensure_ascii=False)}\n")
    # Check if position_map already exists
    cur.execute("SELECT position_map FROM position_meta WHERE id = %s", (position_meta_id,))
    existing = cur.fetchone()
    if existing is None or existing[0] is None:
        # Create new position_map
        cur.execute("UPDATE position_meta SET position_map = %s WHERE id = %s", (json.dumps(position_map), position_meta_id))
        pg_conn.commit()
        print(f"Created new position_map for view_id={view_id}, position_meta_id={position_meta_id}")
    else:
        # Update existing position_map
        cur.execute("UPDATE position_meta SET position_map = %s WHERE id = %s", (json.dumps(position_map), position_meta_id))
        pg_conn.commit()
        print(f"Updated position_map for view_id={view_id}, position_meta_id={position_meta_id}")
    return position_map

if __name__ == "__main__":
    from backend.settings.connection_points import DB_URL
    # Connect to Postgres using DB_URL from config
    pg_conn = psycopg2.connect(DB_URL)

    # Get real CAD data from WSPCustomPNID columns
    # We'll use fetch_smart_objects_for_view to get the first CAD object
    # You may want to adjust project_id and view_id for your test
    project_id = 16  # TODO: set your real project_id
    view_id = 56     # TODO: set your real view_id
    smart_objects = fetch_smart_objects_for_view(pg_conn, project_id, view_id, debug_txt=False)
    if (smart_objects):
        print("\n--- DEBUGGING WITH REAL CAD OBJECT ---")
        debug_cad_to_db_properties(smart_objects[0], pg_conn)
        pa_ids = []
        # Sync all smart objects to project_articles
        for obj in smart_objects:
            mapped_props = map_cad_properties_to_pa(obj, pg_conn)
            debug_sync_payload(mapped_props)
            pa_id = upsert_project_article(pg_conn, project_id, view_id, mapped_props)
            print(f"Upserted project_article with id: {pa_id}")
            pa_ids.append(pa_id)
        # Update position_map with all pa_ids from this sync
        upsert_position_map(pg_conn, view_id, pa_ids)
    else:
        print("No CAD objects found for the given project/view.")
    pg_conn.close()
