# backend/routes/views_routes.py
from fastapi import APIRouter, Request, HTTPException
from sqlalchemy import create_engine, text
from backend.settings.connection_points import DB_URL

router = APIRouter()

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
