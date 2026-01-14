from fastapi import APIRouter, Request
from backend.settings.connection_points import engine
from sqlalchemy import text

router = APIRouter()

@router.get("/articles_table")
async def get_articles_table(request: Request):
    with engine.connect() as conn:
        # Get column names
        columns = [row[0] for row in conn.execute(text("""
            SELECT column_name FROM information_schema.columns WHERE table_name = 'articles'
        """)).fetchall()]
        # Get all data
        data = conn.execute(text("SELECT * FROM articles")).fetchall()
        data_rows = [list(row) for row in data]
    return {"headers": columns, "data": data_rows}
