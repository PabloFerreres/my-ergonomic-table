import asyncpg
from typing import List, Any, Tuple, Optional
from backend.debug_config import DEBUG_FLAGS

async def fetch_table_as_hotarray(
    db_url: str,
    table_name: str,
    limit: int = 1000,
    project_id: Optional[int] = None,
    base_view_id: Optional[int] = None
) -> Tuple[List[str], List[List[Any]]]:
    conn = await asyncpg.connect(dsn=db_url)
    # Use name_external_german for headers if base_view_id is provided
    if base_view_id is not None:
        col_query = '''
            SELECT c.name_external_german AS column_name
            FROM views_columns vc
            JOIN columns c ON vc.column_id = c.id
            WHERE vc.base_view_id = $1 AND vc.visible = TRUE
            ORDER BY vc.position
        '''
        columns = [r['column_name'] for r in await conn.fetch(col_query, base_view_id)]
    else:
        col_query = """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = $1
        """
        columns = [r['column_name'] for r in await conn.fetch(col_query, table_name)]

    if "project_id" in columns and project_id is not None:
        query = f'SELECT * FROM "{table_name}" WHERE project_id = $1 LIMIT {limit}'
        rows = await conn.fetch(query, project_id)
    else:
        query = f'SELECT * FROM "{table_name}" LIMIT {limit}'
        rows = await conn.fetch(query)

    await conn.close()

    if not rows:
        return columns, []
    headers = columns if base_view_id is not None else list(rows[0].keys())
    data = [[row.get(header, "") if row.get(header, None) is not None else "" for header in headers] for row in rows]

    if DEBUG_FLAGS.get("db_to"):
        print("📄 Headers:", headers)
        print("🧮 Full Data:", data)

    return headers, data

async def fetch_table_headers_and_colors(
    db_url: str,
    view_id: int,
    base_view_id: Optional[int] = None
) -> List[dict]:
    """
    Fetch header names (columns.name_external_german) and colors (column_groups.color) for HotTable from views_columns.
    Returns a list of dicts: [{"header": ..., "color": ...}]
    """
    conn = await asyncpg.connect(dsn=db_url)
    query = '''
        SELECT c.name_external_german AS header, cg.color AS color
        FROM views_columns vc
        JOIN columns c ON vc.column_id = c.id
        JOIN column_groups cg ON c.column_group_id = cg.id
        WHERE vc.view_id = $1 AND vc.visible = TRUE
        ORDER BY vc.position
    '''
    rows = await conn.fetch(query, view_id)
    await conn.close()
    return [{"header": r["header"], "color": r["color"]} for r in rows]
