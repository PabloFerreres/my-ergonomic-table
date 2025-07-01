from fastapi import APIRouter, Request
import asyncpg
import asyncio
import json
from pathlib import Path
from backend.routes.layout_routes import router as layout_router
from backend.routes.sheetnames_routes import router as sheetnames_router
from backend.utils.update_draft_articles import apply_edits_to_draft
from backend.loading.create_materialized_tables import refresh_all_materialized
from backend.loading.rematerialize_control import debounce_rematerialize
from backend.settings.connection_points import DB_URL

router = APIRouter()
router.include_router(layout_router)
router.include_router(sheetnames_router, prefix="/api")

HEADER_MAP = json.loads(Path("backend/utils/header_name_map.json").read_text(encoding="utf-8"))


@router.post("/api/updateDraft/{draft_id}")
async def update_draft(draft_id: str, request: Request):
    payload = await request.json()
    conn = await asyncpg.connect(DB_URL)

    await conn.execute("""
        INSERT INTO meta_datas (id, name, data, updated_at)
        VALUES ($1::uuid, $2, $3::jsonb, now())
        ON CONFLICT (id)
        DO UPDATE SET name = EXCLUDED.name, data = EXCLUDED.data, updated_at = now()
    """, draft_id, "payload-test", json.dumps(payload))

    for sheet in payload.get("positions", []):
        sheet_name = sheet.get("sheet")
        position_map = sheet.get("rows", [])
        if not sheet_name:
            continue
        await conn.execute("""
            INSERT INTO position_meta (sheet_name, position_map, updated_at)
            VALUES ($1, $2::jsonb, now())
            ON CONFLICT (sheet_name)
            DO UPDATE SET position_map = EXCLUDED.position_map, updated_at = now()
        """, sheet_name, json.dumps(position_map))

    if "edits" in payload:
        await apply_edits_to_draft(conn, payload["edits"])

    print(f"✅ DB gespeichert: id={draft_id}, edits={len(payload.get('edits', []))}, positions={len(payload.get('positions', []))}")
    refresh_all_materialized()
    await conn.close()
    return {"status": "saved", "id": draft_id, "sheets": len(payload.get("positions", []))}


@router.post("/api/updatePosition")
async def update_position(request: Request):
    payload = await request.json()
    conn = await asyncpg.connect(DB_URL)

    for sheet in payload:
        sheet_name = sheet.get("sheet")
        rows = sheet.get("rows", [])
        if not sheet_name:
            continue
        await conn.execute("""
            INSERT INTO position_meta (sheet_name, position_map, updated_at)
            VALUES ($1, $2::jsonb, now())
            ON CONFLICT (sheet_name)
            DO UPDATE SET position_map = EXCLUDED.position_map, updated_at = now()
        """, sheet_name, json.dumps(rows))
        debounce_rematerialize(sheet_name)

    print(f"✅ PositionMap gespeichert: {len(payload)} sheets")
    await conn.close()
    return {"status": "positions_saved", "sheets": len(payload)}

refresh_all_materialized()


@router.post("/api/updateEdits")
async def update_edits(request: Request):
    payload = await request.json()
    edits = payload.get("edits", [])
    last_used_inserted_id = payload.get("lastUsedInsertedId", None)

    print(f"📥 Eingehende Edits: {len(edits)}")

    conn = await asyncpg.connect(DB_URL)
    updated_count = 0
    edits_by_row = {}

    # INT-Felder definieren
    int_fields = {"project_article_id", "position","article_id"}

    for edit in edits:
        row_id = int(edit["rowId"])
        col = edit["colName"]
        val = edit["newValue"]

        # Snake-Case-Mapping prüfen
        mapped_col = HEADER_MAP.get(col, col)

        # Wenn Feld INT: "" zu None, sonst cast
        if mapped_col in int_fields:
            if val == '' or val is None:
                val = None
            else:
                val = int(val)

        if row_id not in edits_by_row:
            edits_by_row[row_id] = {}
        edits_by_row[row_id][col] = val

    # IDs laden
    existing_ids_result = await conn.fetch("SELECT project_article_id FROM inserted_rows")
    existing_inserted_ids = {r["project_article_id"] for r in existing_ids_result}
    print(f"📋 Inserted IDs (aus DB): {sorted(existing_inserted_ids)}")

    for row_id, updates in edits_by_row.items():
        print(f"\n🔄 Bearbeite row_id = {row_id}, Updates: {updates}")

        if row_id < 0:
            # mapped_updates plus INT fix
            mapped_updates = {}
            for col, val in updates.items():
                mapped_col = HEADER_MAP.get(col, col)
                if mapped_col in int_fields:
                    if val == '':
                        val = None
                    else:
                        val = int(val)
                mapped_updates[mapped_col] = val

            if row_id in existing_inserted_ids:
                set_clause = ", ".join([f'"{col}" = ${i+1}' for i, col in enumerate(mapped_updates.keys())])
                sql = f"""
                    UPDATE inserted_rows
                    SET {set_clause}
                    WHERE project_article_id = ${len(mapped_updates) + 1}
                """
                values = list(mapped_updates.values())
                await conn.execute(sql, *values, row_id)

            else:
                columns = list(mapped_updates.keys())
                values = list(mapped_updates.values())

                if "project_article_id" not in columns:
                    columns.insert(0, "project_article_id")
                    values.insert(0, row_id)

                placeholders = ", ".join([f"${i+1}" for i in range(len(columns))])
                sql = f"""
                    INSERT INTO inserted_rows ({', '.join(f'"{c}"' for c in columns)})
                    VALUES ({placeholders})
                """
                await conn.execute(sql, *values)

        else:
            columns = []
            values = []

            for col in updates.keys():
                mapped = HEADER_MAP.get(col)
                if mapped:
                    columns.append(mapped)
                    val = updates[col]
                    if mapped in int_fields:
                        if val == '':
                            val = None
                        else:
                            val = int(val)
                    values.append(val)

            if not columns:
                print(f"⚠️ Keine gültigen Mappings für: {updates.keys()}")
                continue

            row = await conn.fetchrow(
                "SELECT 1 FROM draft_project_articles WHERE project_article_id = $1", row_id
            )

            if row:
                set_clause = ", ".join([f"{col} = ${i+1}" for i, col in enumerate(columns)])
                sql = f"""
                    UPDATE draft_project_articles
                    SET {set_clause}
                    WHERE project_article_id = ${len(columns)+1}
                """
                print("✏️ UPDATE draft_project_articles SQL:", sql)
                print("✏️ VALUES:", values + [row_id])
                await conn.execute(sql, *values, row_id)
            else:
                insert_columns = list(columns)
                insert_values = values

                if "project_article_id" not in insert_columns:
                    insert_columns.insert(0, "project_article_id")
                    insert_values.insert(0, row_id)

                placeholders = ", ".join([f"${i+1}" for i in range(len(insert_columns))])
                sql = f"""
                    INSERT INTO draft_project_articles ({', '.join(insert_columns)})
                    VALUES ({placeholders})
                """
                print("➕ INSERT draft_project_articles SQL:", sql)
                print("➕ VALUES:", insert_values)
                await conn.execute(sql, *insert_values)

        updated_count += 1

    if last_used_inserted_id is not None:
        await conn.execute("""
            INSERT INTO inserted_id_meta (project_id, last_id)
            VALUES (1, $1)
            ON CONFLICT (project_id) DO UPDATE SET last_id = EXCLUDED.last_id
        """, last_used_inserted_id)
        print(f"📌 lastUsedInsertedId aktualisiert: {last_used_inserted_id}")

    await conn.close()
    print(f"✅ Edits gespeichert: {updated_count} Änderungen")
    return {
        "status": "ok",
        "count": updated_count,
        "log": f"✅ Edits gespeichert: {updated_count} Änderung(en)"
    }



@router.post("/api/rematerializeAll")
async def rematerialize_all():
    refresh_all_materialized()
    log = "🔁 All materialized tables refreshed"
    print(log)
    return {"status": "all_rematerialized", "log": log}


@router.get("/api/last_insert_id")
async def get_last_insert_id(request: Request, project_id: int):
    pool: asyncpg.Pool = request.app.state.db
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT last_id FROM inserted_id_meta WHERE project_id = $1
        """, project_id)
        return {"lastId": row["last_id"] if row else -1}
