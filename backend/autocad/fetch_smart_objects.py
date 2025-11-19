import sqlite3
import json
import pymssql
import re
import uuid

# Path to AutoCAD Plant3D database (can be SQLite file path or SQL Server connection string)
DB_PATH = r"C:\Users\ferreres\Documents\GeneralTemplate1\ProcessPower.dcf"

# Drawing PnPID to target
TARGET_PNPID = 1223

def get_cad_connection(db_path):
    """
    Returns a DB connection and type for either SQLite or SQL Server, depending on db_path format.
    Ensures read-only access for both. Uses pymssql for SQL Server.
    """
    if isinstance(db_path, str) and db_path.strip().startswith("SERVER="):
        # Parse connection string for pymssql
        parts = dict(
            part.split("=", 1) for part in db_path.split(";") if "=" in part
        )
        server = parts.get("SERVER")
        database = parts.get("DATABASE")
        user = parts.get("UID")
        password = parts.get("PWD")
        if not all([server, database, user, password]):
            raise ValueError(f"Missing required SQL Server connection info in db_path: {db_path}")
        return pymssql.connect(server=str(server), user=str(user), password=str(password), database=str(database)), 'mssql'
    else:
        # SQLite, open in read-only mode using URI
        if db_path.startswith("file:"):
            return sqlite3.connect(db_path, uri=True), 'sqlite'
        else:
            return sqlite3.connect(f"file:{db_path}?mode=ro", uri=True), 'sqlite'

def fetch_smart_objects_for_drawing(pnpid: int, source_table: str, db_path = None):
    db_path = db_path or DB_PATH
    conn, db_type = get_cad_connection(db_path)
    cursor = conn.cursor()

    # 1. Get all object RowIds in the target drawing from PnPDataLinks
    placeholder = '%s' if db_type == 'mssql' else '?'
    query1 = f"SELECT RowId FROM PnPDataLinks WHERE DwgId = {placeholder}"
    cursor.execute(query1, (pnpid,))
    row_ids = [row[0] for row in (cursor.fetchall() or [])]
    if not row_ids:
        print(f"No objects found for drawing PnPID={pnpid}")
        conn.close()
        return []

    # 2. Get all relevant objects from the dynamic source table for the project (filter by RowId)
    format_ids = ','.join([placeholder] * len(row_ids))
    query2 = f"SELECT * FROM {source_table} WHERE PnPID IN ({format_ids})"
    cursor.execute(query2, row_ids)
    wsp_objects = cursor.fetchall() or []
    wsp_columns = [desc[0] for desc in cursor.description]

    # 3. Get GUIDs from PnPBase for these objects
    query3 = f"SELECT PnPID, PnPGuid FROM PnPBase WHERE PnPID IN ({format_ids})"
    cursor.execute(query3, row_ids)
    guid_map = {row[0]: row[1] for row in (cursor.fetchall() or [])}

    # 4. Get drawing info from PnPDrawings
    query4 = f"SELECT * FROM PnPDrawings WHERE PnPID = {placeholder}"
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
            elif isinstance(v, uuid.UUID):
                obj_dict[k] = str(v)
        guid_bytes = guid_map.get(obj_dict['PnPID'])
        if guid_bytes is not None:
            if isinstance(guid_bytes, bytes):
                obj_dict['GUID'] = guid_bytes.hex()
            elif isinstance(guid_bytes, uuid.UUID):
                obj_dict['GUID'] = str(guid_bytes)
            else:
                obj_dict['GUID'] = str(guid_bytes)
        else:
            obj_dict['GUID'] = None
        if drawing_info:
            drawing_info_dict = {k: (v.hex() if isinstance(v, bytes) else (str(v) if isinstance(v, uuid.UUID) else v)) for k, v in zip(drawing_columns, drawing_info)}
            obj_dict['DrawingInfo'] = drawing_info_dict
        else:
            obj_dict['DrawingInfo'] = None
        results.append(obj_dict)

    conn.close()
    return results

if __name__ == "__main__":
    data = fetch_smart_objects_for_drawing(TARGET_PNPID, "WSPCustomPNID")
    print(json.dumps(data, indent=2, ensure_ascii=False))
