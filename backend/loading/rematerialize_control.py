import asyncio
import psycopg2
from backend.settings.connection_points import DB_URL, project_id, DEBUG
from backend.loading.create_materialized_tables import create_materialized_table

debounce_tasks: dict[str, asyncio.Task] = {}

def get_view_for_sheet_name(sheet_name: str) -> tuple[int, int] | None:
    conn = psycopg2.connect(DB_URL)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT v.id, v.base_view_id
        FROM views v
        JOIN projects p ON v.project_id = p.id
        WHERE LOWER(CONCAT('materialized_', v.name, '_', p.name)) = %s
          AND v.project_id = %s
    """, (sheet_name.lower(), project_id))
    result = cursor.fetchone()
    cursor.close()
    conn.close()
    if DEBUG:
        print(f"[DEBUG] get_view_for_sheet_name: sheet_name={sheet_name}, result={result}")
    return (result[0], result[1]) if result else None

def debounce_rematerialize(sheet_name: str, delay: float = 2.0):
    async def delayed():
        await asyncio.sleep(delay)
        res = get_view_for_sheet_name(sheet_name)
        if res:
            view_id, base_view_id = res
            print(f"🔁 Rebuilding materialized table for: {sheet_name} (view_id={view_id}, base_view_id={base_view_id})")
            create_materialized_table(view_id=view_id, base_view_id=base_view_id)
        else:
            print(f"⚠️ Sheet not found in DB: {sheet_name}")

    if sheet_name in debounce_tasks:
        debounce_tasks[sheet_name].cancel()

    debounce_tasks[sheet_name] = asyncio.create_task(delayed())


