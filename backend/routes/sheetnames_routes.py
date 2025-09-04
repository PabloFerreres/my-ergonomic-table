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

def _get_active_view_names(conn: sqlalchemy.engine.Connection, project_id: int) -> list[str]:
    rows = conn.execute(sqlalchemy.text("""
        SELECT lower(v.name) AS name
        FROM views v
        WHERE v.project_id = :pid
          AND v.deleted_at IS NULL
    """), {"pid": project_id}).fetchall()
    return [r.name for r in rows]

@router.get("/sheetnames")
async def get_sheet_names(project_id: int = Query(...)) -> list[str]:
    engine = sqlalchemy.create_engine(DB_URL)
    with engine.connect() as conn:
        suffix = _get_project_suffix(conn, project_id)
        if not suffix:
            return []
        active_views = _get_active_view_names(conn, project_id)
        allowed = {f"{MATERIALIZED_PREFIX}{v}_{suffix}" for v in active_views}

    inspector = sqlalchemy.inspect(engine)
    all_tables = inspector.get_table_names(schema="public")
    names = [t for t in all_tables if t in allowed]
    names.sort()
    return names
