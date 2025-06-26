
from fastapi import APIRouter, Body
from typing import List, Union
from backend.layout.layout_optimizer import optimize_table_layout

router = APIRouter(prefix="/api")

@router.post("/layout/estimate")
def estimate_layout(
    headers: List[str] = Body(...),
    data: List[List[Union[str, int]]] = Body(...)
):
    print("📥 Headers:", headers)
    print("📥 Data:", data)
    result = optimize_table_layout(headers, data)
    print("📊 Layout Estimation Result:", result)
    return result
