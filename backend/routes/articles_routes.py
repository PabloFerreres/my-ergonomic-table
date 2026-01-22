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
    # Rematerialize article tables before comparison
    materialize_articles_for_visualizer(1)
    draft_row = payload.get("draft_row", {})
    base_view_id = payload.get("base_view_id", 5)
    table_name = f"materialized_article_viz_{base_view_id}"
    with engine.connect() as conn:
        # Get column names
        columns = [row[0] for row in conn.execute(text(f"""
            SELECT column_name FROM information_schema.columns WHERE table_name = '{table_name}'
        """)).fetchall()]
        # Get all data
        data = conn.execute(text(f'SELECT * FROM {table_name}')).fetchall()
        data_rows = [dict(zip(columns, row)) for row in data]
    # Filter rows by article_typ logic for base_view_id
    if base_view_id == 5:
        data_rows = [row for row in data_rows if row.get("article_typ") == "Motor"]
    elif base_view_id == 6:
        data_rows = [row for row in data_rows if row.get("article_typ") != "Motor" or row.get("article_typ") is None]
    # Optionally, filter out revisions (only compare to base articles)
    # data_rows = [row for row in data_rows if row.get("article_revision_char") in (None, '', 'null')]
    # Only keep rows that match at least one column
    def count_mismatches(row, draft):
        matches = 0
        for col in columns:
            if col in draft and draft[col] is not None and str(draft[col]).strip() != "":
                draft_val = str(draft[col]).strip().lower()
                row_val = str(row.get(col, "")).strip().lower()
                if draft_val in row_val:
                    matches += 1
        return len([col for col in columns if col in draft and draft[col] is not None and str(draft[col]).strip() != ""]) - matches, matches
    results = []
    for row in data_rows:
        mismatches, matches = count_mismatches(row, draft_row)
        if matches > 0:
            results.append({"row": row, "mismatches": mismatches, "matches": matches})
    results.sort(key=lambda x: (x["mismatches"], -x["matches"]))
    return {"headers": columns, "results": results}
