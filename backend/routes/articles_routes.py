from fastapi import APIRouter, Request
from backend.settings.connection_points import engine
from sqlalchemy import text

router = APIRouter()

@router.get("/articles_table")
async def get_articles_table(request: Request, table: int = 5):
    table_name = f"materialized_article_viz_{table}"
    with engine.connect() as conn:
        # Get column names
        columns = [row[0] for row in conn.execute(text(f"""
            SELECT column_name FROM information_schema.columns WHERE table_name = '{table_name}'
        """)).fetchall()]
        # Get all data
        data = conn.execute(text(f"SELECT * FROM {table_name}")).fetchall()
        data_rows = [list(row) for row in data]
    return {"headers": columns, "data": data_rows}
