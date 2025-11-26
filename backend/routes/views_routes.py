# backend/routes/views_routes.py
from fastapi import APIRouter, Request, HTTPException
from sqlalchemy import create_engine, text
from backend.settings.connection_points import DB_URL
from backend.loading.create_materialized_tables import create_materialized_table
from backend.SSE.event_bus import publish
import pymssql

router = APIRouter()

@router.post("/views/set_header_rows_by_sheet")
async def set_header_rows_by_sheet(request: Request):
    """
    Body: { "project_id": int, "sheet_name": str, "header_rows": bool }
    """
    b = await request.json()
    project_id = int(b["project_id"])
    sheet_name = str(b["sheet_name"]).lower()
    header     = bool(b["header_rows"])

    if "elektrik" in sheet_name and header is False:
        raise HTTPException(status_code=400, detail="Elektrik-Sheets erfordern header_rows=true")

    engine = create_engine(DB_URL)
    with engine.begin() as conn:
        # Spalte idempotent sicherstellen
        conn.execute(text("""
            ALTER TABLE views
            ADD COLUMN IF NOT EXISTS header_rows boolean NOT NULL DEFAULT TRUE
        """))

        row = conn.execute(text("""
            SELECT v.id AS view_id, v.base_view_id, v.name AS view_name, p.name AS project_name
            FROM views v
            JOIN projects p ON v.project_id = p.id
            WHERE v.project_id = :pid
              AND LOWER(CONCAT('materialized_', v.name, '_', p.name)) = :sname
        """), {"pid": project_id, "sname": sheet_name}).fetchone()

        if not row:
            raise HTTPException(404, "Sheet/View not found")

        conn.execute(text("UPDATE views SET header_rows=:h WHERE id=:vid"),
                     {"h": header, "vid": row.view_id})

    # Rematerialisieren (nur diese View)
    create_materialized_table(project_id=project_id, view_id=row.view_id, base_view_id=row.base_view_id)

    # SSE nach Abschluss (alle Clients)
    publish(project_id, {
        "type": "remat_done",
        "scope": "sheet",
        "project_id": project_id,
        "sheet": sheet_name,
        "header_rows": header,  # -> Frontend kann Menüstatus direkt setzen
    })

    return {"success": True}

@router.post("/views/get_view_id")
async def get_view_id(request: Request):
    """
    Body: { "project_id": int, "sheet_name": str }
    Returns: { "view_id": int }
    """
    b = await request.json()
    project_id = int(b["project_id"])
    sheet_name = str(b["sheet_name"]).lower()

    engine = create_engine(DB_URL)
    with engine.begin() as conn:
        row = conn.execute(text("""
            SELECT v.id AS view_id
            FROM views v
            JOIN projects p ON v.project_id = p.id
            WHERE v.project_id = :pid
              AND LOWER(CONCAT('materialized_', v.name, '_', p.name)) = :sname
        """), {"pid": project_id, "sname": sheet_name}).fetchone()

        if not row:
            raise HTTPException(404, "Sheet/View not found")
        return {"view_id": row.view_id}

@router.get("/views/get_view_id")
async def get_view_id_get(request: Request):
    # Read from query params for GET
    project_id = request.query_params.get("project_id")
    sheet_name = request.query_params.get("sheet_name")
    if not project_id or not sheet_name:
        raise HTTPException(400, "Missing project_id or sheet_name")
    engine = create_engine(DB_URL)
    with engine.begin() as conn:
        row = conn.execute(text("""
            SELECT v.id AS view_id
            FROM views v
            JOIN projects p ON v.project_id = p.id
            WHERE v.project_id = :pid
              AND LOWER(CONCAT('materialized_', v.name, '_', p.name)) = :sname
        """), {"pid": int(project_id), "sname": sheet_name.lower()}).fetchone()
        if not row:
            raise HTTPException(404, "Sheet/View not found")
        return {"view_id": row.view_id}

@router.get("/views")
async def list_views(request: Request):
    project_id = request.query_params.get("project_id")
    if not project_id:
        raise HTTPException(400, "Missing project_id")
    engine = create_engine(DB_URL)
    with engine.begin() as conn:
        rows = conn.execute(text("""
            SELECT v.id, v.name, v.cad_drawing_guid, v.cad_drawing_title
            FROM views v
            WHERE v.project_id = :pid
        """), {"pid": int(project_id)}).fetchall()
        return [
            {
                "id": row.id,
                "name": row.name,
                "cad_drawing_guid": row.cad_drawing_guid or "",
                "cad_drawing_title": row.cad_drawing_title or ""
            }
            for row in rows
        ]

@router.post("/views/soft_delete")
async def soft_delete_view(request: Request):
    """
    Soft-Delete eines Sheets anhand seines *vollen* materialized Tabellennamens.
    Erwartet JSON: { "project_id": int, "sheet_name": "materialized_<viewname>_<project_suffix>" }

    - matched case-insensitive gegen: materialized_{views.name}_{projects.project_materialized_name}
    - setzt nur views.deleted_at = now()
    - KEIN Drop der physischen Objekte (Reste werden anderweitig ignoriert)
    """
    body = await request.json()
    project_id = body.get("project_id")
    sheet_name = body.get("sheet_name")

    if not isinstance(project_id, int) or not isinstance(sheet_name, str):
        raise HTTPException(status_code=400, detail="project_id(int) & sheet_name(str) required")

    engine = create_engine(DB_URL)
    with engine.begin() as conn:
        # exakter Vergleich des vollständigen Namens (case-insensitive)
        row = conn.execute(
            text("""
                UPDATE views AS v
                SET deleted_at = now()
                FROM projects AS p
                WHERE v.project_id = :pid
                  AND p.id = :pid
                  AND v.deleted_at IS NULL
                  AND lower('materialized_' || v.name || '_' || p.project_materialized_name) = lower(:sheet_name)
                RETURNING v.id
            """),
            {"pid": project_id, "sheet_name": sheet_name},
        ).fetchone()

        if not row:
            # nichts gefunden → klare Fehlermeldung liefern
            raise HTTPException(status_code=404, detail="Sheet not found for this project")

        return {"success": True, "view_id": row[0], "sheet_name": sheet_name}

@router.post("/views/{view_id}/connect_drawing")
async def connect_drawing_to_view(view_id: int, request: Request):
    body = await request.json()
    drawing_title = body.get("drawing_title")
    if not drawing_title:
        raise HTTPException(status_code=400, detail="Missing drawing_title")
    # Get the CAD DB path for the project
    engine = create_engine(DB_URL)
    with engine.begin() as conn:
        # Get project_id for the view
        project_row = conn.execute(text("SELECT project_id FROM views WHERE id = :vid"), {"vid": view_id}).fetchone()
        if not project_row:
            raise HTTPException(status_code=404, detail="View not found")
        project_id = project_row.project_id
        # Get CAD DB path
        project_db_row = conn.execute(text("SELECT project_cad_db_path FROM projects WHERE id = :pid"), {"pid": project_id}).fetchone()
        if not project_db_row or not project_db_row.project_cad_db_path:
            raise HTTPException(status_code=404, detail="Project CAD DB path not set")
        cad_db_path = project_db_row.project_cad_db_path
    # Detect DB type and query for drawing guid
    row = None
    if isinstance(cad_db_path, str) and cad_db_path.strip().startswith("SERVER="):
        # SQL Server via pymssql
        parts = dict(part.split("=", 1) for part in cad_db_path.split(";") if "=" in part)
        server = parts.get("SERVER")
        database = parts.get("DATABASE")
        user = parts.get("UID")
        password = parts.get("PWD")
        if not all([server, database, user, password]):
            raise HTTPException(status_code=400, detail=f"Missing required SQL Server connection info in db_path: {cad_db_path}")
        # Cast to str to satisfy type checker
        server = str(server)
        database = str(database)
        user = str(user)
        password = str(password)
        try:
            print(f"[DEBUG] pymssql.connect(server={server}, user={user}, password=****, database={database})")
            print(f"[DEBUG] Drawing title: {drawing_title}")
            conn = pymssql.connect(server=server, user=user, password=password, database=database)
            cursor = conn.cursor()
            cursor.execute("SELECT PnPDrawingGuid FROM PnPDrawings WHERE Title = %s", (drawing_title,))
            row = cursor.fetchone()
            print(f"[DEBUG] Query result: {row}")
            conn.close()
        except Exception as e:
            print(f"[DEBUG] SQL Server CAD DB error: {e}")
            raise HTTPException(status_code=500, detail=f"SQL Server CAD DB error: {e}")
    else:
        # SQLite
        import sqlite3
        try:
            cad_conn = sqlite3.connect(cad_db_path)
            cad_cursor = cad_conn.cursor()
            cad_cursor.execute("SELECT PnPDrawingGuid FROM PnPDrawings WHERE Title = ?", (drawing_title,))
            row = cad_cursor.fetchone()
            cad_conn.close()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"SQLite CAD DB error: {e}")
    if not row:
        return {"success": False, "error": "Drawing title not found in CAD DB"}
    guid = row[0]
    # Update the view's cad_drawing_guid
    with engine.begin() as conn:
        conn.execute(text("UPDATE views SET cad_drawing_guid = :guid, cad_drawing_title = :title WHERE id = :vid"), {"guid": guid, "title": drawing_title, "vid": view_id})
    return {"success": True, "cad_drawing_guid": guid}
