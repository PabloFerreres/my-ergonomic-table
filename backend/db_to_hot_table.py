import asyncpg
from typing import List, Any, Tuple
from backend.debug_config import DEBUG_FLAGS

async def fetch_table_as_hotarray(
    db_url: str, 
    table_name: str, 
    limit: int = 500
) -> Tuple[List[str], List[List[Any]]]:
    """
    Liest alle Daten einer Tabelle als 2D-Array (für Handsontable)
    Rückgabe: (headers, rows)
    """
    conn = await asyncpg.connect(dsn=db_url)
    # Holt alle Zeilen (oder nur limit)
    query = f'SELECT * FROM "{table_name}" LIMIT {limit}'
    rows = await conn.fetch(query)
    await conn.close()

    if not rows:
        return [], []
    
    # Spaltennamen extrahieren (dynamisch!)
    headers = list(rows[0].keys())

    # Zeilen als Array-Array
    data = [[row[header] if row[header] is not None else "" for header in headers] for row in rows]

    if DEBUG_FLAGS.get("db_to"):
        print("📄 Headers:", headers)
        print("🧮 Full Data:", data)

    return headers, data
