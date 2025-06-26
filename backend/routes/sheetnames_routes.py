# backend/routes/sheetnames_routes.py

from fastapi import APIRouter
import sqlalchemy
from backend.settings.connection_points import DB_URL

router = APIRouter()


@router.get("/sheetnames")
async def get_sheet_names():
    engine = sqlalchemy.create_engine(DB_URL)
    inspector = sqlalchemy.inspect(engine)
    all_tables = inspector.get_table_names()
    materialized_tables = [name for name in all_tables if name.startswith("materialized_")]
    return materialized_tables
