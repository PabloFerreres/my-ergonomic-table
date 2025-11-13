import sys
import os
if __name__ == "__main__":
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from fastapi import APIRouter, Query
import psycopg2
from backend.settings.connection_points import DB_URL, DEBUG

router = APIRouter()

@router.get("/column-header-colors")
def get_column_header_colors(
    debug: bool = Query(False)
) -> dict[str, str]:
    """
    Returns a mapping of {header: color} for all columns in the DB.
    header = columns.name_external_german
    color = column_groups.color (hex string)
    """
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    try:
        cur.execute('''
            SELECT c.name_external_german, cg.color
            FROM columns c
            LEFT JOIN column_groups cg ON c.column_group_id = cg.id
            WHERE c.name_external_german IS NOT NULL
        ''')
        result = {row[0]: row[1] for row in cur.fetchall() if row[0]}
        if debug or DEBUG:
            print(f"[DEBUG] Header color map (all columns): {result}")
        return result
    finally:
        cur.close(); conn.close()

if __name__ == "__main__":
    print("[DEBUG] Running header color map debug...")
    result = get_column_header_colors(debug=True)
    print("[DEBUG] Result:")
    for k, v in result.items():
        print(f"  {k!r}: {v!r}")
