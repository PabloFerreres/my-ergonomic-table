import asyncpg
from typing import List, Any, Tuple, Optional
from backend.debug_config import DEBUG_FLAGS

async def fetch_table_as_hotarray(
    db_url: str,
    table_name: str,
    limit: int = 500,
    project_id: Optional[int] = None
) -> Tuple[List[str], List[List[Any]]]:
    conn = await asyncpg.connect(dsn=db_url)
    
    # Dynamisch Spalten prüfen
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
        return [], []
    headers = list(rows[0].keys())
    data = [[row[header] if row[header] is not None else "" for header in headers] for row in rows]

    if DEBUG_FLAGS.get("db_to"):
        print("📄 Headers:", headers)
        print("🧮 Full Data:", data)

    return headers, data
