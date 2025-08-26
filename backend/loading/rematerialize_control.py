import asyncio
import psycopg2
from backend.SSE.event_bus import publish
from backend.settings.connection_points import DB_URL, DEBUG
from backend.loading.create_materialized_tables import create_materialized_table, refresh_all_materialized
from backend.elektrik.create_materialized_elektrik import create_materialized_elektrik

debounce_tasks: dict[str, asyncio.Task] = {}

def get_view_for_sheet_name(sheet_name: str, project_id: int) -> tuple[int, int] | None:
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

def debounce_rematerialize(sheet_name: str, project_id: int, delay: float = 2.0):
    key = f"sheet:{project_id}:{sheet_name}"   # 🔸 vorher nur sheet_name
    async def delayed():
        await asyncio.sleep(delay)
        res = get_view_for_sheet_name(sheet_name, project_id)
        if res:
            view_id, base_view_id = res
            print(f"🔁 Rebuilding materialized table for: {sheet_name} (view_id={view_id}, base_view_id={base_view_id})")
            create_materialized_table(project_id, view_id=view_id, base_view_id=base_view_id)
            publish(project_id, {"type":"remat_done","scope":"sheet","sheet":sheet_name,"project_id":project_id})
        else:
            print(f"⚠️ Sheet not found in DB: {sheet_name} (project_id={project_id})")
    if key in debounce_tasks: debounce_tasks[key].cancel()
    debounce_tasks[key] = asyncio.create_task(delayed())

def schedule_sheet_and_elektrik_rematerialize(project_id: int, sheet_name: str, delay: float = 0.8):
    """Remat dieses Sheet **und** Elektrik; publish **ein** Event danach."""
    key = f"combo:{project_id}:{sheet_name}"

    async def delayed():
        await asyncio.sleep(delay)
        res = get_view_for_sheet_name(sheet_name, project_id)
        if not res:
            print(f"⚠️ Sheet not found for combo-remat: {sheet_name} (project_id={project_id})")
            return
        view_id, base_view_id = res

        # parallel im Thread-Pool, blockiert Event-Loop nicht
        await asyncio.gather(
            asyncio.to_thread(create_materialized_table, project_id, view_id, base_view_id),
            asyncio.to_thread(create_materialized_elektrik, project_id),
        )
        publish(project_id, {
            "type": "remat_done",
            "scope": "sheet+elektrik",
            "sheet": sheet_name,
            "project_id": project_id
        })

    if key in debounce_tasks:
        debounce_tasks[key].cancel()
    debounce_tasks[key] = asyncio.create_task(delayed())

def schedule_all_rematerialize(project_id: int, delay: float = 0.8):
    key = f"all:{project_id}"
    async def delayed():
        await asyncio.sleep(delay)
        refresh_all_materialized(project_id)
        create_materialized_elektrik(project_id)
        publish(project_id, {"type":"remat_done","scope":"all","project_id":project_id})
    if key in debounce_tasks: debounce_tasks[key].cancel()
    debounce_tasks[key] = asyncio.create_task(delayed())


