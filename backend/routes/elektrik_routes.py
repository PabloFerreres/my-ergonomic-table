from fastapi import APIRouter
from backend.elektrik.get_active_data import get_active_project_articles
from backend.elektrik.create_materialized_elektrik import create_materialized_elektrik
router = APIRouter()

@router.post("/elektrik_update")
async def trigger_elektrik_update(project_id):
    ids = get_active_project_articles(project_id)  # Kein Parameter!
    return {"status": "ok", "count": len(ids) if ids else 0}


router = APIRouter()

@router.post("/materialize_elektrik")
async def materialize_elektrik_api(project_id):
    # Funktion macht alles synchron, daher kein async nötig
    ok = create_materialized_elektrik(project_id)
    return {"status": "ok" if ok else "error"}