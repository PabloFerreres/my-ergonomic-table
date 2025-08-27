import re, sqlalchemy
from sqlalchemy.engine import Connection

def get_suffix(conn: Connection, project_id: int) -> str:
    return conn.execute(
        sqlalchemy.text("""
          SELECT project_materialized_name
          FROM projects WHERE id=:pid
        """), {"pid": project_id}
    ).scalar_one()

def mat_name(view_name: str, suffix: str) -> str:
    v = re.sub(r'[^a-z0-9_]+', '_', view_name.lower())
    return f"materialized_{v}_{suffix}"

def assert_belongs(table: str, suffix: str) -> bool:
    return isinstance(table, str) and table.startswith("materialized_") and table.endswith(f"_{suffix}")
