import json
from collections import defaultdict
from typing import List, Dict, Any
import asyncpg
import os

with open(os.path.join(os.path.dirname(__file__), "header_name_map.json"), encoding="utf-8") as f:
    GRID_TO_DRAFT_MAP: Dict[str, str] = json.load(f)


async def apply_edits_to_draft(conn: asyncpg.Connection, edits: List[Dict[str, Any]]):
    # 1. Gültige Spaltennamen
    col_query = """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'draft_project_articles'
    """
    valid_cols_result = await conn.fetch(col_query)
    valid_cols = {row["column_name"] for row in valid_cols_result}

    # 2. Bereits existierende IDs
    existing_ids_result = await conn.fetch("SELECT project_article_id FROM draft_project_articles")
    existing_ids = {r["project_article_id"] for r in existing_ids_result}

    # 3. Änderungen aggregieren
    rows = defaultdict(dict)
    for edit in edits:
        row_id = edit["rowId"]
        grid_col = edit.get("colName")
        if not grid_col:
            continue

        draft_col = GRID_TO_DRAFT_MAP.get(grid_col)
        if not draft_col or draft_col not in valid_cols:
            continue

        rows[row_id][draft_col] = edit["newValue"]

    # 4. Insert/Update pro row_id
    for row_id, updates in rows.items():
        columns = list(updates.keys())
        values = [updates[col] for col in columns]

        if row_id in existing_ids:
            set_clause = ", ".join([f"{col} = ${i+1}" for i, col in enumerate(columns)])
            sql = f"""
                UPDATE draft_project_articles
                SET {set_clause}
                WHERE project_article_id = ${len(columns) + 1}
            """
            await conn.execute(sql, *values, row_id)
            print(f"✏️  UPDATED draft row: {row_id}, cols: {columns}")
        else:
            columns.insert(0, "project_article_id")
            values.insert(0, row_id)
            placeholders = ", ".join([f"${i+1}" for i in range(len(columns))])
            sql = f"""
                INSERT INTO draft_project_articles ({', '.join(columns)})
                VALUES ({placeholders})
            """
            await conn.execute(sql, *values)
            print(f"🆕 INSERTED draft row: {row_id}, cols: {columns[1:]}")
