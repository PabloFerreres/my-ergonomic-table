# backend/routes/projects_routes.py
from fastapi import APIRouter, Request, Query, HTTPException
import sqlalchemy
from backend.settings.connection_points import DB_URL

router = APIRouter()

# -------------------------------------------------------------------
# GET: nur aktive Projekte (Soft-Delete ausgeblendet)
# -------------------------------------------------------------------
@router.get("/projects")
async def get_projects():
    engine = sqlalchemy.create_engine(DB_URL)
    with engine.connect() as conn:
        rows = conn.execute(sqlalchemy.text("""
            SELECT id, name
            FROM projects
            WHERE deleted_at IS NULL
            ORDER BY name
        """)).fetchall()
        return [{"id": r[0], "name": r[1]} for r in rows]

# -------------------------------------------------------------------
# POST: Projekt anlegen (+ project_materialized_name = lower(name) ohne Whitespace)
# -------------------------------------------------------------------
@router.post("/projects")
async def create_project(request: Request):
    body = await request.json()
    raw_name = (body.get("name") or "").strip()
    if not raw_name:
        return {"success": False, "error": "name required"}

    engine = sqlalchemy.create_engine(DB_URL)
    with engine.begin() as conn:
        # Duplikat-Guard auf Suffix der aktiven Projekte
        exists = conn.execute(sqlalchemy.text("""
            SELECT 1
            FROM projects
            WHERE project_materialized_name = regexp_replace(lower(:n), '[[:space:]]+', '', 'g')
              AND deleted_at IS NULL
            LIMIT 1
        """), {"n": raw_name}).first()
        if exists:
            return {"success": False, "error": "project name already exists"}

        row = conn.execute(
            sqlalchemy.text("""
                INSERT INTO projects (name, project_materialized_name)
                VALUES (:n, regexp_replace(lower(:n), '[[:space:]]+', '', 'g'))
                RETURNING id, name
            """),
            {"n": raw_name},
        ).mappings().one()

    return {"id": row["id"], "name": row["name"]}

# -------------------------------------------------------------------
# Helper: sicher droppen mit Typ-Erkennung + SAVEPOINTs
# -------------------------------------------------------------------
def _drop_materialized_for_suffix(conn: sqlalchemy.engine.Connection,
                                  engine: sqlalchemy.Engine,
                                  suffix: str) -> dict:
    """
    Dropt Objekte namens materialized_*_{suffix}:
    - Materialized Views (pg_matviews)
    - normale Views
    - Tables
    Jede DROP-Operation läuft in einem SAVEPOINT, damit Fehler die Tx nicht abbrechen.
    """
    insp = sqlalchemy.inspect(engine)

    # 1) Kandidaten listen
    tables = [t for t in insp.get_table_names(schema="public")
              if t.startswith("materialized_") and t.endswith(f"_{suffix}")]

    views = [v for v in insp.get_view_names(schema="public")
             if v.startswith("materialized_") and v.endswith(f"_{suffix}")]

    matviews = conn.execute(sqlalchemy.text("""
        SELECT matviewname
        FROM pg_matviews
        WHERE schemaname = 'public'
    """)).scalars().all()
    matviews = [m for m in matviews
                if m.startswith("materialized_") and m.endswith(f"_{suffix}")]

    dropped = {"matviews": 0, "views": 0, "tables": 0}

    # 2) Reihenfolge: erst MVs, dann Views, dann Tables
    for name in matviews:
        try:
            with conn.begin_nested():  # SAVEPOINT
                conn.execute(sqlalchemy.text(f'DROP MATERIALIZED VIEW IF EXISTS "{name}" CASCADE'))
                dropped["matviews"] += 1
        except Exception as e:
            print(f"[DROP MV warn] {name}: {e}")

    for name in views:
        try:
            with conn.begin_nested():  # SAVEPOINT
                conn.execute(sqlalchemy.text(f'DROP VIEW IF EXISTS "{name}" CASCADE'))
                dropped["views"] += 1
        except Exception as e:
            print(f"[DROP VIEW warn] {name}: {e}")

    for name in tables:
        try:
            with conn.begin_nested():  # SAVEPOINT
                conn.execute(sqlalchemy.text(f'DROP TABLE IF EXISTS "{name}" CASCADE'))
                dropped["tables"] += 1
        except Exception as e:
            print(f"[DROP TABLE warn] {name}: {e}")

    return dropped

# -------------------------------------------------------------------
# DELETE: Soft-Delete (markieren + vorhandene materialized_* droppen)
# -------------------------------------------------------------------
@router.delete("/projects/{project_id}")
async def delete_project_soft(project_id: int, mode: str = Query("soft")):
    if mode != "soft":
        raise HTTPException(status_code=400, detail="only soft delete supported here")

    engine = sqlalchemy.create_engine(DB_URL)
    with engine.begin() as conn:
        # nur aktive Projekte
        suffix = conn.execute(sqlalchemy.text("""
            SELECT project_materialized_name
            FROM projects
            WHERE id = :id AND deleted_at IS NULL
        """), {"id": project_id}).scalar()
        if not suffix:
            raise HTTPException(status_code=404, detail="project not found or already deleted")

        # existierende materialized_*_{suffix} sicher droppen
        stats = _drop_materialized_for_suffix(conn, engine, suffix)

        # Projekt als gelöscht markieren
        conn.execute(
            sqlalchemy.text("UPDATE projects SET deleted_at = now() WHERE id = :id"),
            {"id": project_id},
        )

    return {"success": True, "mode": "soft", **stats}

# -------------------------------------------------------------------
# GET: Projekt-Info (inkl. Views)
# -------------------------------------------------------------------
@router.get("/projects/{project_id}/info")
async def get_project_info(project_id: int):
    engine = sqlalchemy.create_engine(DB_URL)
    with engine.connect() as conn:
        # Get project info
        project_row = conn.execute(sqlalchemy.text("""
            SELECT id, name, project_cad_db_path
            FROM projects
            WHERE id = :id AND deleted_at IS NULL
        """), {"id": project_id}).fetchone()
        if not project_row:
            raise HTTPException(status_code=404, detail="Project not found")
        # Get views for project
        views = conn.execute(sqlalchemy.text("""
            SELECT id, name, cad_drawing_title, cad_drawing_guid, base_view_id
            FROM views
            WHERE project_id = :id AND deleted_at IS NULL
        """), {"id": project_id}).fetchall()
        views_list = [
            {
                "id": v.id,
                "name": v.name,
                "cad_drawing_title": v.cad_drawing_title,
                "cad_drawing_guid": v.cad_drawing_guid,
                "base_view_id": v.base_view_id
            } for v in views
        ]
        return {
            "id": project_row.id,
            "name": project_row.name,
            "project_cad_db_path": project_row.project_cad_db_path,
            "views": views_list
        }

# -------------------------------------------------------------------
# POST: Update CAD DB Path
# -------------------------------------------------------------------
@router.post("/projects/{project_id}/cad_db_path")
async def update_project_cad_db_path(project_id: int, request: Request):
    body = await request.json()
    new_path = body.get("cad_db_path")
    if not new_path:
        raise HTTPException(status_code=400, detail="Missing cad_db_path")
    engine = sqlalchemy.create_engine(DB_URL)
    with engine.begin() as conn:
        result = conn.execute(sqlalchemy.text("""
            UPDATE projects SET project_cad_db_path = :path WHERE id = :id AND deleted_at IS NULL
        """), {"path": new_path, "id": project_id})
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Project not found or already deleted")
    return {"success": True, "cad_db_path": new_path}
