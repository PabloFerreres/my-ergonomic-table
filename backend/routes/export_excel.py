# backend/routes/export_excel.py
from fastapi import APIRouter, Body
from fastapi.responses import Response
from backend.export.excel_export import build_excel   # <-- HIER

router = APIRouter()

@router.post("/export/excel")
def export_excel(payload: dict = Body(...)):
    content = build_excel(payload)
    filename = payload.get("filename", "export.xlsx")
    return Response(
        content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )
