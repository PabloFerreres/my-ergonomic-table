# backend/routes/sheetnames_routes.py

from fastapi import APIRouter
import sqlalchemy

router = APIRouter()

DB_URL = "postgresql://myuser:1999@localhost:5432/one_project_db_milestone"

@router.get("/sheetnames")
async def get_sheet_names():
    engine = sqlalchemy.create_engine(DB_URL)
    inspector = sqlalchemy.inspect(engine)
    all_tables = inspector.get_table_names()
    materialized_tables = [name for name in all_tables if name.startswith("materialized_")]
    return materialized_tables
