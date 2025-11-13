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
) -> dict[str, dict]:
    """
    Returns a mapping of {header: {color, color_name}} for all columns in the DB.
    header = columns.name_external_german
    color = column_groups.color (hex string)
    color_name = column_groups.color_name (e.g. 'header-green')
    """
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    try:
        cur.execute('''
            SELECT c.name_external_german, cg.color, cg.color_name
            FROM columns c
            LEFT JOIN column_groups cg ON c.column_group_id = cg.id
            WHERE c.name_external_german IS NOT NULL
        ''')
        result = {
            row[0]: {
                "color": row[1] if row[1] is not None else "#f0f0f0",
                "color_name": row[2] if row[2] is not None else ""
            }
            for row in cur.fetchall() if row[0]
        }
        if debug or DEBUG:
            print(f"[DEBUG] Header color map (all columns): {result}")
        return result
    finally:
        cur.close(); conn.close()

@router.get("/column-header-colors-legacy")
def get_column_header_colors_legacy(
    debug: bool = Query(False)
) -> dict:
    """
    Returns a mapping of {color_name: {color, headers: [...]}} for all columns in the DB, including static grid entries.
    """
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    try:
        cur.execute('''
            SELECT c.name_external_german, cg.color, cg.color_name
            FROM columns c
            LEFT JOIN column_groups cg ON c.column_group_id = cg.id
            WHERE c.name_external_german IS NOT NULL
        ''')
        color_map = {}
        for row in cur.fetchall():
            header, color, color_name = row
            if not color_name:
                continue
            if color_name not in color_map:
                color_map[color_name] = {"color": color or "#f0f0f0", "headers": []}
            color_map[color_name]["headers"].append(header)
        # Add static entries for grid-header-rows and grid-inbetween-red
        color_map["grid-header-rows"] = {
            "color": "#999999",
            "headers": [],
            "used_for": ["HEADER rows (Einbauort-Gruppen) Hintergrund"]
        }
        color_map["grid-inbetween-red"] = {
            "color": "#FF0000",
            "headers": [],
            "used_for": ["In-between '**' Markierung / Trennhinweis"]
        }
        if debug or DEBUG:
            print(f"[DEBUG] Legacy header color map: {color_map}")
        return color_map
    finally:
        cur.close(); conn.close()

if __name__ == "__main__":
    print("[DEBUG] Running header color map debug...")
    result = get_column_header_colors(debug=True)
    print("[DEBUG] Result:")
    for k, v in result.items():
        print(f"  {k!r}: {v!r}")
