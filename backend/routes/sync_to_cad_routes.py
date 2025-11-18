# backend/routes/sync_to_cad_routes.py
from fastapi import APIRouter, Request
from backend.autocad.sync_to_cad import fetch_smart_objects_for_view, map_cad_properties_to_pa, upsert_project_article, upsert_position_map, map_cad_properties_to_draft, upsert_article_draft
from backend.settings.connection_points import DB_URL
import psycopg2
from backend.SSE.event_bus import publish

router = APIRouter()

@router.post("/sync_to_cad")
async def sync_to_cad(request: Request):
    data = await request.json()
    project_id = int(data.get("project_id"))
    view_id = int(data.get("view_id"))
    try:
        pg_conn = psycopg2.connect(DB_URL)
        # 1. Fetch smart objects
        smart_objects = fetch_smart_objects_for_view(pg_conn, project_id, view_id, debug_txt=True)
        pa_ids = []
        # Get base_view_id for conditional draft sync
        cur = pg_conn.cursor()
        cur.execute("SELECT base_view_id FROM views WHERE id = %s", (view_id,))
        base_view_row = cur.fetchone()
        base_view_id = base_view_row[0] if base_view_row else None
        for obj in smart_objects:
            mapped = map_cad_properties_to_pa(obj, pg_conn)
            pa_id = upsert_project_article(pg_conn, project_id, view_id, mapped_props=mapped)
            pa_ids.append(pa_id)
            # If base_view_id == 3, also sync to article_drafts
            if base_view_id == 3:
                draft_props = map_cad_properties_to_draft(obj, pg_conn)
                upsert_article_draft(pg_conn, pa_id, draft_props)
        # Update position_map
        upsert_position_map(pg_conn, view_id, pa_ids)
        pg_conn.close()
        # 2. Trigger SSE for rematerialize and refresh
        publish(project_id, {"type": "remat_done", "scope": "all", "project_id": project_id})
        publish(project_id, {"type": "refresh", "scope": "all", "project_id": project_id})
        return {"status": "success", "updated": len(pa_ids)}
    except Exception as e:
        return {"status": "error", "error": str(e)}
