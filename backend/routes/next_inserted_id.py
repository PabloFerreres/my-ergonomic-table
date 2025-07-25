from fastapi import APIRouter
import asyncpg
from backend.settings.connection_points import DB_URL

router = APIRouter()

@router.get("/next_inserted_id")
async def next_inserted_id():
    conn = await asyncpg.connect(DB_URL)
    # Hole und erhöhe atomar den Wert
    result = await conn.fetchrow("""
        UPDATE inserted_id_meta
        SET last_id = last_id - 1
        WHERE id = 1
        RETURNING last_id
    """)
    await conn.close()
    if result and "last_id" in result:
        return {"next_id": result["last_id"]}
    else:
        return {"error": "inserted_id_meta row not found"}
