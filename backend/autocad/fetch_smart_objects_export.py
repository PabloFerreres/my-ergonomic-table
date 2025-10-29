import sqlite3
import json

# Path to AutoCAD Plant3D database
DB_PATH = r"C:\Users\ferreres\Documents\GeneralTemplate1\ProcessPower.dcf"

# Drawing PnPID to target
TARGET_PNPID = 1223

OUTPUT_PATH = r"C:\Users\ferreres\my-ergonomic-table\backend\autocad\smart_objects_export.txt"

def fetch_smart_objects_for_drawing(pnpid: int):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 1. Get all object RowIds in the target drawing from PnPDataLinks
    cursor.execute("""
        SELECT RowId
        FROM PnPDataLinks
        WHERE DwgId = ?
    """, (pnpid,))
    row_ids = [row[0] for row in cursor.fetchall()]
    if not row_ids:
        print(f"No objects found for drawing PnPID={pnpid}")
        return []

    # 2. Get all relevant objects from WSPCustomPNID for the project (filter by RowId)
    format_ids = ','.join(['?'] * len(row_ids))
    cursor.execute(f"""
        SELECT *
        FROM WSPCustomPNID
        WHERE PnPID IN ({format_ids})
    """, row_ids)
    wsp_objects = cursor.fetchall()
    wsp_columns = [desc[0] for desc in cursor.description]

    # 3. Get GUIDs from PnPBase for these objects
    cursor.execute(f"""
        SELECT PnPID, PnPGuid
        FROM PnPBase
        WHERE PnPID IN ({format_ids})
    """, row_ids)
    guid_map = {row[0]: row[1] for row in cursor.fetchall()}

    # 4. Get drawing info from PnPDrawings
    cursor.execute("SELECT * FROM PnPDrawings WHERE PnPID = ?", (pnpid,))
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
    data = fetch_smart_objects_for_drawing(TARGET_PNPID)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        f.write(json.dumps(data, indent=2, ensure_ascii=False))
    print(f"Exported {len(data)} objects to {OUTPUT_PATH}")
