import psycopg2
import sqlite3
import os
import json
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

def fetch_smart_objects_for_view(pg_conn, project_id: int, view_id: int, debug_txt: bool = True):
    """
    Fetch smart objects from Plant 3D DB for a given project/view.
    1. Get CAD DB path from projects.project_cad_db_path
    2. Get drawing guid from views.cad_drawing_guid
    3. Connect to Plant 3D DB (sqlite)
    4. Find PnPID in PnPDrawings using the guid
    5. Get all object RowIds in the target drawing from PnPDataLinks (DwgId = PnPID)
    6. Get all relevant objects from WSPCustomPNID for the project (filter by RowId)
    7. Get GUIDs from PnPBase for these objects
    8. Get drawing info from PnPDrawings
    9. Combine all data
    """
    cur = pg_conn.cursor()
    cur.execute("""
        SELECT p.project_cad_db_path, v.cad_drawing_guid
        FROM projects p
        JOIN views v ON v.project_id = p.id
        WHERE p.id = %s AND v.id = %s
    """, (project_id, view_id))
    row = cur.fetchone()
    if not row:
        raise Exception("Project or view not found, or missing CAD DB path/guid")
    db_path, drawing_guid = row
    db_path = db_path.strip('"')
    if not drawing_guid.startswith('{'):
        drawing_guid = '{' + drawing_guid
    if not drawing_guid.endswith('}'):
        drawing_guid = drawing_guid + '}'
    print(f"[DEBUG] CAD DB path: {db_path}")
    print(f"[DEBUG] Drawing guid used for query: {drawing_guid}")
    if not os.path.exists(db_path):
        raise Exception(f"CAD DB file does not exist: {db_path}")
    cad_conn = sqlite3.connect(db_path)
    cursor = cad_conn.cursor()

    # Step 1: Find PnPID for the drawing guid
    cursor.execute("SELECT PnPID FROM PnPDrawings WHERE PnPDrawingGuid = ?", (drawing_guid,))
    pnp_row = cursor.fetchone()
    if not pnp_row:
        raise Exception("Drawing guid not found in Plant 3D DB")
    pnpid = pnp_row[0]

    # Step 2: Get all object RowIds in the target drawing from PnPDataLinks
    cursor.execute("SELECT RowId FROM PnPDataLinks WHERE DwgId = ?", (pnpid,))
    row_ids = [row[0] for row in cursor.fetchall()]
    if not row_ids:
        print(f"No objects found for drawing PnPID={pnpid}")
        cad_conn.close()
        return []

    # Step 3: Get all relevant objects from WSPCustomPNID for the project (filter by RowId)
    format_ids = ','.join(['?'] * len(row_ids))
    cursor.execute(f"SELECT * FROM WSPCustomPNID WHERE PnPID IN ({format_ids})", row_ids)
    wsp_objects = cursor.fetchall()
    wsp_columns = [desc[0] for desc in cursor.description]

    # Step 4: Get GUIDs from PnPBase for these objects
    cursor.execute(f"SELECT PnPID, PnPGuid FROM PnPBase WHERE PnPID IN ({format_ids})", row_ids)
    guid_map = {row[0]: row[1] for row in cursor.fetchall()}

    # Step 5: Get drawing info from PnPDrawings
    cursor.execute("SELECT * FROM PnPDrawings WHERE PnPID = ?", (pnpid,))
    drawing_info = cursor.fetchone()
    drawing_columns = [desc[0] for desc in cursor.description]

    # Step 6: Combine all data
    results = []
    for obj in wsp_objects:
        obj_dict = dict(zip(wsp_columns, obj))
        for k, v in obj_dict.items():
            if isinstance(v, bytes):
                obj_dict[k] = v.hex()
        guid_bytes = guid_map.get(obj_dict['PnPID'])
        if guid_bytes is not None:
            obj_dict['GUID'] = guid_bytes.hex() if isinstance(guid_bytes, bytes) else str(guid_bytes)
        else:
            obj_dict['GUID'] = None
        if drawing_info:
            drawing_info_dict = {k: (v.hex() if isinstance(v, bytes) else v) for k, v in zip(drawing_columns, drawing_info)}
            obj_dict['DrawingInfo'] = drawing_info_dict
        else:
            obj_dict['DrawingInfo'] = None
        results.append(obj_dict)

    if debug_txt:
        import json
        debug_path = os.path.join(os.path.dirname(__file__), "smart_objects_debug.txt")
        with open(debug_path, "w", encoding="utf-8") as f:
            f.write(json.dumps(results, indent=2, ensure_ascii=False))

    cad_conn.close()
    return results

def map_cad_properties_to_pa(obj, pg_conn):
    """
    Maps a CAD object dictionary to a dict of project_articles columns using the columns table in the DB.
    Only properties present in columns.name are mapped (case-insensitive).
    Special logic for relevance_e_tech and soll_eigenschaften.
    """
    cur = pg_conn.cursor()
    cur.execute("SELECT name FROM columns")
    db_columns = set(row[0].lower() for row in cur.fetchall())

    result = {}
    debug_log = []
    # Map only CAD properties that exist in columns.name (case-insensitive)
    for cad_prop, val in obj.items():
        col_name = cad_prop.lower()
        # Skip special columns, handle below
        if col_name in db_columns and col_name not in ["relevance_e_tech", "soll_eigenschaften"]:
            # Special handling for EinbauortID if needed
            if col_name == "einbauortid":
                if val is not None:
                    try:
                        if isinstance(val, str) and val.endswith(".0"):
                            val = val[:-2]
                        val = int(float(val))
                    except Exception:
                        val = None
            result[col_name] = val
    debug_log.append(f"Direct property mapping result: {result}")

    # Special logic for relevance_e_tech (E1/E2 boolean logic)
    E1 = obj.get('relevanz_e_tech')
    E2 = obj.get('safety')
    E1_bool = bool(E1) and E1 != 0
    E2_bool = bool(E2) and E2 != 0
    E3 = ""
    if E1_bool and E2_bool:
        E3 = "ES"
    elif E1_bool and not E2_bool:
        E3 = "E"
    result['relevance_e_tech'] = E3
    debug_log.append(f"Computed relevance_e_tech: {E3}")

    # Special logic for soll_eigenschaften: join soll_einstellung and soll_einstellung_einheit
    soll_einstellung = obj.get('soll_einstellung')
    soll_einstellung_einheit = obj.get('soll_einstellung_einheit')
    if soll_einstellung is not None or soll_einstellung_einheit is not None:
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

def create_position_map(pg_conn, pa_ids):
    """
    Creates a position_map JSON for the given list of pa_ids, sorted by project_articles.emsr_no ascending.
    Each entry: {"position": n, "project_article_id": pa_id}
    """
    cur = pg_conn.cursor()
    # Fetch emsr_no for all pa_ids
    format_ids = ','.join(['%s'] * len(pa_ids))
    cur.execute(f"SELECT id, emsr_no FROM project_articles WHERE id IN ({format_ids})", pa_ids)
    rows = cur.fetchall()
    # Map pa_id to emsr_no
    emsr_map = {row[0]: row[1] for row in rows}
    # Sort pa_ids by emsr_no (None values last)
    sorted_pa_ids = sorted(pa_ids, key=lambda pid: (emsr_map.get(pid) is None, emsr_map.get(pid)))
    # Build position_map
    position_map = []
    for idx, pa_id in enumerate(sorted_pa_ids, start=1):
        position_map.append({"position": idx, "project_article_id": pa_id})
    return position_map

def update_position_meta(pg_conn, view_id, position_map):
    """
    Updates the position_map in position_meta for the given view_id.
    Finds position_meta_id from views, then updates position_meta.position_map.
    """
    cur = pg_conn.cursor()
    # Get position_meta_id for the view
    cur.execute("SELECT position_meta_id FROM views WHERE id = %s", (view_id,))
    row = cur.fetchone()
    if not row:
        raise Exception(f"No position_meta_id found for view_id={view_id}")
    position_meta_id = row[0]
    # Update position_map
    cur.execute("UPDATE position_meta SET position_map = %s WHERE id = %s", (json.dumps(position_map), position_meta_id))
    pg_conn.commit()
    print(f"Updated position_meta.position_map for view_id={view_id}, position_meta_id={position_meta_id}")

def debug_cad_to_db_properties(cad_obj, pg_conn):
    """
    Debug utility: Print all property names from CAD (all keys, lowercased), all DB property names (columns.name), and the intersection (those we will use).
    For CAD, show all keys in the object (lowercased). For DB, show all columns.name. Intersection: those present in both.
    """
    cur = pg_conn.cursor()
    cur.execute("SELECT name FROM columns")
    db_names = set([row[0] for row in cur.fetchall()])
    cad_names = set([k.strip().lower() for k in cad_obj.keys()])
    print("All property names from CAD (lowercased):")
    for k in cad_obj.keys():
        print(f"  - {k.strip().lower()}")
    print("\nAll property names from DB (columns.name):")
    for name in db_names:
        print(f"  - {name}")
    print("\nProperties that will be used (intersection):")
    for cad_name in cad_names:
        if cad_name in db_names:
            print(f"  - CAD: '{cad_name}' -> DB column: '{cad_name}'")
    return

if __name__ == "__main__":
    from backend.settings.connection_points import DB_URL
    # Connect to Postgres using DB_URL from config
    pg_conn = psycopg2.connect(DB_URL)

    # Get real CAD data from WSPCustomPNID columns
    # We'll use fetch_smart_objects_for_view to get the first CAD object
    # You may want to adjust project_id and view_id for your test
    project_id = 16  # TODO: set your real project_id
    view_id = 54     # TODO: set your real view_id
    smart_objects = fetch_smart_objects_for_view(pg_conn, project_id, view_id, debug_txt=False)
    if smart_objects:
        print("\n--- DEBUGGING WITH REAL CAD OBJECT ---")
        debug_cad_to_db_properties(smart_objects[0], pg_conn)
    else:
        print("No CAD objects found for the given project/view.")
    pg_conn.close()
