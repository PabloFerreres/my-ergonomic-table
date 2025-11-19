import sqlite3
import json
import pyodbc
import re

# Path to AutoCAD Plant3D database (can be SQLite file path or SQL Server connection string)
DB_PATH = r"C:\Users\ferreres\Documents\GeneralTemplate1\ProcessPower.dcf"

# Drawing PnPID to target
TARGET_PNPID = 1223

def get_cad_connection(db_path):
    """
    Returns a DB connection for either SQLite or SQL Server, depending on db_path format.
    Ensures read-only access for both.
    """
    if isinstance(db_path, str) and db_path.strip().startswith("DRIVER="):
        # SQL Server via pyodbc, add ApplicationIntent=ReadOnly if not present
        if "ApplicationIntent=ReadOnly" not in db_path:
            db_path += ";ApplicationIntent=ReadOnly"
        return pyodbc.connect(db_path, autocommit=True)
    else:
        # SQLite, open in read-only mode using URI
        if db_path.startswith("file:"):
            return sqlite3.connect(db_path, uri=True)
        else:
            return sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)

def fetch_smart_objects_for_drawing(pnpid: int, source_table: str, db_path = None):
    db_path = db_path or DB_PATH
    conn = get_cad_connection(db_path)
    cursor = conn.cursor()

    # 1. Get all object RowIds in the target drawing from PnPDataLinks
    query1 = "SELECT RowId FROM PnPDataLinks WHERE DwgId = ?"
    cursor.execute(query1, (pnpid,))
    row_ids = [row[0] for row in cursor.fetchall()]
    if not row_ids:
        print(f"No objects found for drawing PnPID={pnpid}")
        conn.close()
        return []

    # 2. Get all relevant objects from the dynamic source table for the project (filter by RowId)
    format_ids = ','.join(['?'] * len(row_ids))
    query2 = f"SELECT * FROM {source_table} WHERE PnPID IN ({format_ids})"
    cursor.execute(query2, row_ids)
    wsp_objects = cursor.fetchall()
    wsp_columns = [desc[0] for desc in cursor.description]

    # 3. Get GUIDs from PnPBase for these objects
    query3 = f"SELECT PnPID, PnPGuid FROM PnPBase WHERE PnPID IN ({format_ids})"
    cursor.execute(query3, row_ids)
    guid_map = {row[0]: row[1] for row in cursor.fetchall()}

    # 4. Get drawing info from PnPDrawings
    query4 = "SELECT * FROM PnPDrawings WHERE PnPID = ?"
    cursor.execute(query4, (pnpid,))
    drawing_info = cursor.fetchone()
    drawing_columns = [desc[0] for desc in cursor.description]

    # 5. Combine all data
    results = []
    for obj in wsp_objects:
        obj_dict = dict(zip(wsp_columns, obj))
        # Convert any bytes fields to hex or string for JSON serialization
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

    conn.close()
    return results

if __name__ == "__main__":
    data = fetch_smart_objects_for_drawing(TARGET_PNPID, "WSPCustomPNID")
    print(json.dumps(data, indent=2, ensure_ascii=False))
