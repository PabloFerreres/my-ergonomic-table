# backend/routes/views_routes.py
from fastapi import APIRouter, Request, HTTPException
from sqlalchemy import create_engine, text
from backend.settings.connection_points import DB_URL
from backend.loading.create_materialized_tables import create_materialized_table
from backend.SSE.event_bus import publish

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
