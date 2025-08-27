# backend/routes/sheetnames_routes.py
from fastapi import APIRouter, Query
import sqlalchemy
from backend.settings.connection_points import DB_URL

router = APIRouter()

MATERIALIZED_PREFIX = "materialized_"

def _get_project_suffix(conn: sqlalchemy.engine.Connection, project_id: int) -> str | None:
    row = conn.execute(
        sqlalchemy.text(
            "SELECT project_materialized_name FROM projects WHERE id = :id"
        ),
        {"id": project_id},
    ).fetchone()
    return None if not row else row[0]

@router.get("/sheetnames")
async def get_sheet_names(project_id: int = Query(...)) -> list[str]:
    """
    Liefert die Namen aller bereits existierenden materialisierten Tabellen
    für das gegebene Projekt: materialized_<view>_<project_materialized_name>
    """
    engine = sqlalchemy.create_engine(DB_URL)

    # 1) Suffix holen
    with engine.connect() as conn:
        suffix = _get_project_suffix(conn, project_id)
    if not suffix:
        return []

    # 2) Alle Tabellennamen inspizieren (public)
    inspector = sqlalchemy.inspect(engine)
    all_tables = inspector.get_table_names(schema="public")

    # 3) Filtern nach materialized_*_{suffix}
    names = [
        t for t in all_tables
        if t.startswith(MATERIALIZED_PREFIX) and t.endswith(f"_{suffix}")
    ]

    # 4) Stabil sortieren (alphabetisch)
    names.sort()
    return names
