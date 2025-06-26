import asyncio
from backend.loading.create_materialized_tables import create_materialized_table
from backend.loading.create_materialized_tables import get_view_id_from_sheet_name

debounce_tasks: dict[str, asyncio.Task] = {}

def debounce_rematerialize(sheet_name: str, delay: float = 2.0):
    async def delayed():
        await asyncio.sleep(delay)
        view_id = get_view_id_from_sheet_name(sheet_name)
        if view_id:
            print(f"🔁 Rebuilding materialized table for: {sheet_name} (view_id={view_id})")
            create_materialized_table(view_id=view_id)
        else:
            print(f"⚠️ Sheet not found in DB: {sheet_name}")

    if sheet_name in debounce_tasks:
        debounce_tasks[sheet_name].cancel()

    debounce_tasks[sheet_name] = asyncio.create_task(delayed())
