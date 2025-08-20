from fastapi import APIRouter, Request, Query, HTTPException
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


# --------- INSERT: sort_order IMMER serverseitig bestimmen ---------
@router.post("/stairhierarchy")
async def insert_stair_element(request: Request):
    data = await request.json()
    conn = await asyncpg.connect(DB_URL)

    parent_id = data.get("parent_id")

    # project_id sicher ermitteln (Root: aus Payload; Kind: vom Parent übernehmen)
    if parent_id is None:
        project_id = data.get("project_id")
        if project_id is None:
            await conn.close()
            raise HTTPException(status_code=400, detail="project_id required for root")
    else:
        row = await conn.fetchrow(
            "SELECT project_id FROM stair_element_einbauorte WHERE id = $1",
            parent_id
        )
        if not row:
            await conn.close()
            raise HTTPException(status_code=400, detail="parent not found")
        project_id = row["project_id"]

    # sort_order: an das Ende der Geschwistergruppe
    next_sort = await conn.fetchval("""
        SELECT COALESCE(MAX(sort_order) + 1, 1)
        FROM stair_element_einbauorte
        WHERE project_id = $1
          AND parent_id IS NOT DISTINCT FROM $2
    """, project_id, parent_id)

    await conn.execute("""
        INSERT INTO stair_element_einbauorte (project_id, name, parent_id, sort_order)
        VALUES ($1, $2, $3, $4)
    """, project_id, data["name"], parent_id, next_sort)

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


# --------- MOVE: atomarer Tausch + korrekt nach project_id filtern ---------
@router.post("/stairhierarchy/move")
async def move_element(request: Request):
    data = await request.json()
    el_id = int(data["id"])
    direction = -1 if int(data["direction"]) < 0 else 1

    conn = await asyncpg.connect(DB_URL)
    try:
        await conn.execute("BEGIN")

        # zu bewegendes Element sperren + project_id holen
        row = await conn.fetchrow("""
            SELECT id, project_id, parent_id, sort_order
            FROM stair_element_einbauorte
            WHERE id = $1
            FOR UPDATE
        """, el_id)
        if not row:
            await conn.execute("ROLLBACK")
            raise HTTPException(status_code=404, detail="not found")

        # direkten Nachbarn in gleicher Gruppe sperren
        neigh = await conn.fetchrow("""
            SELECT id, sort_order
            FROM stair_element_einbauorte
            WHERE project_id = $1
              AND parent_id IS NOT DISTINCT FROM $2
              AND sort_order = $3
            FOR UPDATE
        """, row["project_id"], row["parent_id"], row["sort_order"] + direction)

        if not neigh:
            await conn.execute("ROLLBACK")
            return {"status": "noop"}  # oben/unten, nichts zu tun

        # atomarer Swap in EINEM UPDATE
        await conn.execute("""
            UPDATE stair_element_einbauorte
            SET sort_order = CASE
                WHEN id = $1 THEN $4
                WHEN id = $2 THEN $3
                ELSE sort_order
            END
            WHERE id IN ($1, $2)
        """, row["id"], neigh["id"], row["sort_order"], neigh["sort_order"])

        await conn.execute("COMMIT")
        return {"status": "ok"}
    except Exception:
        await conn.execute("ROLLBACK")
        raise
    finally:
        await conn.close()


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
    return [{"id": r["id"], "label": r["full_name"]} for r in rows]


@router.put("/stairhierarchy/{id}")
async def rename_stair_element(id: int, request: Request):
    data = await request.json()
    new_name = data.get("name")
    if not isinstance(new_name, str) or not new_name.strip():
        raise HTTPException(status_code=400, detail="name required")

    conn = await asyncpg.connect(DB_URL)
    try:
        result = await conn.execute(
            "UPDATE stair_element_einbauorte SET name = $1 WHERE id = $2",
            new_name.strip(), id
        )
    finally:
        await conn.close()

    if not result.endswith(" 1"):
        raise HTTPException(status_code=404, detail="element not found")

    return {"status": "ok", "id": id, "name": new_name.strip()}


@router.post("/stairhierarchy/reorder")
async def reorder_siblings(request: Request):
    """
    Setzt die sort_order einer Geschwistergruppe exakt so,
    wie sie der Client vorgibt (1..n in Reihenfolge von ordered_ids).
    Payload:
      {
        "project_id": 123,
        "parent_id": null | number,
        "ordered_ids": [5, 9, 2, ...]   // neue sichtbare Reihenfolge
      }
    """
    data = await request.json()
    project_id = data.get("project_id")
    parent_id = data.get("parent_id")  # kann None sein
    ordered_ids = data.get("ordered_ids")

    if not isinstance(project_id, int):
        raise HTTPException(status_code=400, detail="project_id required")
    if not isinstance(ordered_ids, list) or not all(isinstance(i, int) for i in ordered_ids):
        raise HTTPException(status_code=400, detail="ordered_ids must be a list of int")
    if len(ordered_ids) == 0:
        return {"status": "ok"}  # nichts zu tun

    conn = await asyncpg.connect(DB_URL)
    try:
        await conn.execute("BEGIN")

        # 1) Hole *alle* Geschwister-IDs dieser Gruppe (und sperre sie)
        sibling_rows = await conn.fetch("""
            SELECT id
            FROM stair_element_einbauorte
            WHERE project_id = $1
              AND parent_id IS NOT DISTINCT FROM $2
            ORDER BY sort_order
            FOR UPDATE
        """, project_id, parent_id)

        sibling_ids = [r["id"] for r in sibling_rows]

        # 2) Validierung: gleiche Menge?
        if set(sibling_ids) != set(ordered_ids) or len(sibling_ids) != len(ordered_ids):
            await conn.execute("ROLLBACK")
            raise HTTPException(
                status_code=400,
                detail="ordered_ids must match exactly the sibling set for given project_id/parent_id"
            )

        # 3) sort_order = 1..n gemäß Reihenfolge der ordered_ids
        #    Effizient per UPDATE FROM (unnest)
        new_orders = list(range(1, len(ordered_ids) + 1))
        await conn.execute("""
            UPDATE stair_element_einbauorte t
            SET sort_order = v.new_order
            FROM (
                SELECT UNNEST($1::int[]) AS id, UNNEST($2::int[]) AS new_order
            ) AS v
            WHERE t.id = v.id
        """, ordered_ids, new_orders)

        await conn.execute("COMMIT")
        return {"status": "ok", "count": len(ordered_ids)}
    except Exception:
        await conn.execute("ROLLBACK")
        raise
    finally:
        await conn.close()