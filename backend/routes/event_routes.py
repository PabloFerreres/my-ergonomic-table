# backend/routes/sse.py
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from backend.SSE.event_bus import stream

router = APIRouter(tags=["sse"])

@router.get("/sse")
async def sse(project_id: int = Query(..., description="Project scope for SSE events")):
    # schlanke Headers für proxies
    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",  # für Nginx: kein Buffering
    }
    return StreamingResponse(stream(project_id), media_type="text/event-stream", headers=headers)
