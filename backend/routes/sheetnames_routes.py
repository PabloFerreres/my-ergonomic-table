from fastapi import APIRouter
import sqlalchemy
from backend.settings.connection_points import DB_URL, project_id

router = APIRouter()

@router.get("/sheetnames")
async def get_sheet_names():
    engine = sqlalchemy.create_engine(DB_URL)
    inspector = sqlalchemy.inspect(engine)
    all_tables = inspector.get_table_names()

    # 1. Hole den Suffix für dieses Projekt (projects.project_materialized_name)
    with engine.connect() as conn:
        result = conn.execute(
            sqlalchemy.text("SELECT project_materialized_name FROM projects WHERE id = :id"),
            {"id": project_id}
        )
        row = result.fetchone()
        if not row or row[0] is None:
            return []
        project_name = row[0]

    # 2. Filter: materialized_*_{project_name}
    materialized_tables = [
        name for name in all_tables
        if name.startswith("materialized_") and name.endswith(f"_{project_name}")
    ]

    return materialized_tables
