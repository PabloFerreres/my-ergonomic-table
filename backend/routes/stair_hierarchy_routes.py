from fastapi import APIRouter, Request, Query
import asyncpg
from backend.settings.connection_points import DB_URL
from backend.einbauorte.create_materialized_einbauorte import rematerialize_project_einbauorte

router = APIRouter()

@router.get("/stairhierarchy")
async def get_stair_elements(project_id: int = Query(...)):
    conn = await asyncpg.connect(DB_URL)

    async def build_tree(parent_id):
        rows = await conn.fetch("""
            SELECT id, name, sort_order
            FROM stair_element_einbauorte
            WHERE parent_id = $1
            ORDER BY sort_order
        """, parent_id)
        return [
            {
                "id": r["id"],
                "name": r["name"],
                "sort_order": r["sort_order"],
                "children": await build_tree(r["id"])
            }
            for r in rows
        ]

    roots = await conn.fetch("""
        SELECT id, name, sort_order
        FROM stair_element_einbauorte
        WHERE parent_id IS NULL AND project_id = $1
        ORDER BY sort_order
    """, project_id)

    tree = []
    for r in roots:
        tree.append({
            "id": r["id"],
            "name": r["name"],
            "sort_order": r["sort_order"],
            "children": await build_tree(r["id"])
        })

    await conn.close()
    return tree


@router.post("/stairhierarchy")
async def insert_stair_element(request: Request):
    data = await request.json()
    conn = await asyncpg.connect(DB_URL)

    project_id = data.get("project_id")

    # Falls Kind: Project-ID vom Parent übernehmen
    if data.get("parent_id") is not None:
        row = await conn.fetchrow(
            "SELECT project_id FROM stair_element_einbauorte WHERE id = $1",
            data["parent_id"]
        )
        if row:
            project_id = row["project_id"]

    await conn.execute("""
        INSERT INTO stair_element_einbauorte (project_id, name, parent_id, sort_order)
        VALUES ($1, $2, $3, $4)
    """, project_id, data["name"], data.get("parent_id"), data.get("sort_order"))

    await conn.close()
    return {"status": "ok"}



@router.delete("/stairhierarchy/{id}")
async def delete_stair_element(id: int):
    conn = await asyncpg.connect(DB_URL)
    await conn.execute("""
        DELETE FROM stair_element_einbauorte WHERE id = $1
    """, id)
    await conn.close()
    return {"status": "deleted"}

@router.post("/stairhierarchy/move")
async def move_element(request: Request):
    data = await request.json()
    element_id = data["id"]
    direction = data["direction"]  # -1 oder 1

    conn = await asyncpg.connect(DB_URL)

    elem = await conn.fetchrow("SELECT parent_id, sort_order FROM stair_element_einbauorte WHERE id = $1", element_id)
    if not elem:
        await conn.close()
        return {"error": "not found"}

    siblings = await conn.fetch("""
        SELECT id, sort_order FROM stair_element_einbauorte
        WHERE parent_id IS NOT DISTINCT FROM $1
        ORDER BY sort_order
    """, elem["parent_id"])

    idx = next((i for i, row in enumerate(siblings) if row["id"] == element_id), None)
    if idx is None:
        await conn.close()
        return {"error": "element not in sibling list"}

    new_idx = idx + direction
    if 0 <= new_idx < len(siblings):
        a, b = siblings[idx], siblings[new_idx]
        await conn.execute(
            "UPDATE stair_element_einbauorte SET sort_order = $1 WHERE id = $2",
            b["sort_order"], a["id"]
        )
        await conn.execute(
            "UPDATE stair_element_einbauorte SET sort_order = $1 WHERE id = $2",
            a["sort_order"], b["id"]
        )

    await conn.close()
    return {"status": "ok"}

@router.get("/rematerialize_einbauorte")
@router.post("/rematerialize_einbauorte")
async def rematerialize(project_id: int = Query(...)):
    conn = await asyncpg.connect(DB_URL)
    count = await rematerialize_project_einbauorte(conn, project_id)
    await conn.close()
    return {"status": "ok", "count": count}

@router.get("/materialized_einbauorte")
async def get_materialized(project_id: int = Query(...)):
    conn = await asyncpg.connect(DB_URL)
    rows = await conn.fetch("""
        SELECT id, full_name
        FROM materialized_einbauorte
        WHERE project_id = $1
        ORDER BY full_name
    """, project_id)
    await conn.close()
    # fürs Dropdown: value=id, label=full_name
    return [{"id": r["id"], "label": r["full_name"]} for r in rows]
