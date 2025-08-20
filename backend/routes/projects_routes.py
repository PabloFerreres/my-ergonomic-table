from fastapi import APIRouter
import sqlalchemy
from backend.settings.connection_points import DB_URL

router = APIRouter()

@router.get("/projects")
async def get_projects():
    engine = sqlalchemy.create_engine(DB_URL)
    with engine.connect() as conn:
        result = conn.execute(
            sqlalchemy.text("SELECT id, name FROM projects ORDER BY name")
        )
        return [{"id": row[0], "name": row[1]} for row in result.fetchall()]
