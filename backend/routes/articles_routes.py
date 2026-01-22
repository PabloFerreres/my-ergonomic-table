from fastapi import APIRouter, Request, Body
from backend.settings.connection_points import engine
from sqlalchemy import text
from typing import Dict, Any
from backend.articles.create_materialized_article_tables import materialize_articles_for_visualizer

router = APIRouter()

@router.get("/articles_table")
async def get_articles_table(request: Request, table: int = 5):
    table_name = f"materialized_article_viz_{table}"
    with engine.connect() as conn:
        # Get column names
        columns = [row[0] for row in conn.execute(text(f"""
            SELECT column_name FROM information_schema.columns WHERE table_name = '{table_name}'
        """)).fetchall()]
        # Get all data
        data = conn.execute(text(f"SELECT * FROM {table_name}")).fetchall()
        data_rows = [list(row) for row in data]
    return {"headers": columns, "data": data_rows}

@router.post("/compare_article_draft")
async def compare_article_draft(
    payload: Dict[str, Any] = Body(...)
):
    materialize_articles_for_visualizer(1)
    draft_row = payload.get("draft_row", {})
    base_view_id = payload.get("base_view_id", 5)
    table_name = f"materialized_article_viz_{base_view_id}"
    with engine.connect() as conn:
        columns = [row[0] for row in conn.execute(text(f"""
            SELECT column_name FROM information_schema.columns WHERE table_name = '{table_name}'
        """)).fetchall()]
        data = conn.execute(text(f'SELECT * FROM {table_name}')).fetchall()
        data_rows = [dict(zip(columns, row)) for row in data]
    if base_view_id == 5:
        data_rows = [row for row in data_rows if row.get("article_typ") == "Motor"]
    elif base_view_id == 6:
        data_rows = [row for row in data_rows if row.get("article_typ") != "Motor" or row.get("article_typ") is None]
    def get_cell_matches(row, draft):
        cell_matches = {}
        matches = 0
        mismatches = 0
        for col in columns:
            draft_val = draft.get(col, None)
            if draft_val is not None and str(draft_val).strip() != "":
                draft_val_str = str(draft_val).strip().lower()
                cell_val_str = str(row.get(col, "")).strip().lower()
                if draft_val_str in cell_val_str and cell_val_str != "":
                    cell_matches[col] = "match"
                    matches += 1
                else:
                    cell_matches[col] = "mismatch"
                    mismatches += 1
        return cell_matches, matches, mismatches
    results = []
    for row in data_rows:
        cell_matches, matches, mismatches = get_cell_matches(row, draft_row)
        if matches > 0:
            perfect_match = mismatches == 0
            results.append({
                "row": row,
                "cell_matches": cell_matches,
                "matches": matches,
                "mismatches": mismatches,
                "perfect_match": perfect_match
            })
    results.sort(key=lambda x: (x["mismatches"], -x["matches"]))
    return {"headers": columns, "results": results}
