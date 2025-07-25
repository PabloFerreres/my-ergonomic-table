from fastapi import APIRouter, Request
from backend.utils.sheet_create_utils import create_sheet_full

router = APIRouter()

@router.post("/views/create_sheet")
async def create_sheet(request: Request):
    try:
        body = await request.json()
    except Exception:
        return {"success": False, "error": "Kein gültiges JSON erhalten"}

    if not isinstance(body, dict):
        return {"success": False, "error": "JSON muss Objekt sein"}

    display_name = (body.get("display_name") or "").strip()
    base_view_id = body.get("base_view_id")
    project_id = body.get("project_id")

    if not display_name:
        return {"success": False, "error": "Display-Name fehlt"}
    if base_view_id is None or project_id is None:
        return {"success": False, "error": "base_view_id oder project_id fehlt"}

    try:
        base_view_id = int(base_view_id)
        project_id = int(project_id)
    except Exception:
        return {"success": False, "error": "IDs müssen Integer sein"}

    # Jetzt zentrale Funktion benutzen!
    ok, result = create_sheet_full(display_name, base_view_id, project_id)
    if ok:
        return {"success": True, **result}
    else:
        return {"success": False, **result}
