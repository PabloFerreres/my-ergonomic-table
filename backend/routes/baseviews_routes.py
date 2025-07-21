from fastapi import APIRouter
import sqlalchemy
from backend.settings.connection_points import DB_URL

router = APIRouter()

@router.get("/baseviews")
async def get_base_views():
    engine = sqlalchemy.create_engine(DB_URL)
    with engine.connect() as conn:
        result = conn.execute(
            sqlalchemy.text("SELECT id, name_display FROM base_views")
        )
        return [{"id": row[0], "name": row[1]} for row in result.fetchall()]

