from fastapi import APIRouter, Request, Query
import asyncpg
import asyncio,sqlalchemy
import json
from pathlib import Path


from backend.SSE.event_bus import publish
from backend.routes.layout_routes import router as layout_router
from backend.routes.sheetnames_routes import router as sheetnames_router
from backend.routes.baseviews_routes import router as baseviews_router
from backend.utils.update_draft_articles import apply_edits_to_draft
from backend.loading.create_materialized_tables import refresh_all_materialized
from backend.loading.rematerialize_control import (
    schedule_sheet_and_elektrik_rematerialize,
    schedule_all_rematerialize,   # <-- wichtig
)
from backend.settings.connection_points import DB_URL, DEBUG, get_views_to_show
from backend.routes.elektrik_routes import router as elektrik_router
from backend.elektrik.create_materialized_elektrik import create_materialized_elektrik
from backend.routes.projects_routes import router as project_router
from backend.routes.new_sheet import router as new_sheet_router
from backend.routes.next_inserted_id import router as next_inserted_id
from backend.routes.stair_hierarchy_routes import router as stair_router
from backend.routes.dropdown_contents import router as dropdown_router
from backend.routes.export_excel import router as export_excel_router
from backend.routes.event_routes import router as sse_router
from backend.routes.views_routes import router as views_router
from backend.routes.sync_to_cad_routes import router as sync_to_cad_router
from backend.routes.header_colors import router as header_colors_router

router = APIRouter(prefix="/api")
router.include_router(views_router)
router.include_router(sse_router)
router.include_router(dropdown_router)
router.include_router(stair_router)
router.include_router(next_inserted_id)
router.include_router(new_sheet_router)
router.include_router(layout_router)
router.include_router(project_router)
router.include_router(sheetnames_router)
router.include_router(baseviews_router)
router.include_router(elektrik_router)
router.include_router(export_excel_router)
router.include_router(sync_to_cad_router)
router.include_router(header_colors_router)

HEADER_MAP = json.loads(Path("backend/utils/header_name_map.json").read_text(encoding="utf-8"))


@router.post("/updatePosition")
async def update_position(request: Request, project_id: int = Query(...)):
    payload = await request.json()
    conn = await asyncpg.connect(DB_URL)

    any_elektrik = False
    normal_sheets: set[str] = set()

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

        if str(sheet_name).startswith("materialized_elektrik_"):
            any_elektrik = True
        else:
            normal_sheets.add(sheet_name)

        if DEBUG:
            print(f"[DEBUG] Updated position_meta for sheet: {sheet_name}")

    await conn.close()

    # 🔔 genau EIN Remat-Trigger (keine Doppel-Events)
    if any_elektrik:
        schedule_all_rematerialize(project_id)  # Elektrik-Änderung ⇒ ALL (+Elektrik) ⇒ 1 Publish
    else:
        if len(normal_sheets) == 1:
            schedule_sheet_and_elektrik_rematerialize(project_id, next(iter(normal_sheets)))
        elif len(normal_sheets) > 1:
            schedule_all_rematerialize(project_id)

    if DEBUG:
        print(f"✅ PositionMap gespeichert: {len(payload)} sheets")
    return {"status": "positions_saved", "sheets": len(payload)}


@router.post("/updateEdits")
async def update_edits(request: Request, project_id: int = Query(...)):
    payload = await request.json()
    edits = payload.get("edits", [])
    sheet_name = payload.get("sheet")  # kommt vom Frontend (sendEdits)

    if DEBUG:
        print(f"📥 Eingehende Edits: {len(edits)} auf Sheet={sheet_name}")

    conn = await asyncpg.connect(DB_URL)
    updated_count = 0
    edits_by_row: dict[int, dict] = {}

    int_fields = {"project_article_id", "position", "article_id"}

    for edit in edits:
        row_id = int(edit["rowId"])
        col = edit["colName"]
        val = edit["newValue"]

        mapped_col = HEADER_MAP.get(col, col)
        if mapped_col in int_fields:
            if val == '' or val is None:
                val = None
            else:
                val = int(val)

        if row_id not in edits_by_row:
            edits_by_row[row_id] = {}
        edits_by_row[row_id][col] = val

    existing_ids_result = await conn.fetch("SELECT project_article_id FROM inserted_rows")
    existing_inserted_ids = {r["project_article_id"] for r in existing_ids_result}
    if DEBUG:
        print(f"📋 Inserted IDs (aus DB): {sorted(existing_inserted_ids)}")

    for row_id, updates in edits_by_row.items():
        if DEBUG:
            print(f"\n🔄 Bearbeite row_id = {row_id}, Updates: {updates}")

        if row_id < 0:
            mapped_updates = {}
            for c, v in updates.items():
                mc = HEADER_MAP.get(c, c)
                if mc in int_fields:
                    if v == '':
                        v = None
                    else:
                        v = int(v)
                mapped_updates[mc] = v

            if row_id in existing_inserted_ids:
                set_clause = ", ".join([f'"{col}" = ${i+1}' for i, col in enumerate(mapped_updates.keys())])
                sql = f"""
                    UPDATE inserted_rows
                    SET {set_clause}
                    WHERE project_article_id = ${len(mapped_updates) + 1}
                """
                values = list(mapped_updates.values())
                if DEBUG:
                    print("✏️ UPDATE inserted_rows SQL:", sql)
                    print("✏️ VALUES:", values + [row_id])
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
                if DEBUG:
                    print("➕ INSERT inserted_rows SQL:", sql)
                    print("➕ VALUES:", values)
                await conn.execute(sql, *values)

        else:
            columns, values = [], []
            for c in updates.keys():
                mc = HEADER_MAP.get(c)
                if mc:
                    columns.append(mc)
                    v = updates[c]
                    if mc in int_fields:
                        if v == '':
                            v = None
                        else:
                            v = int(v)
                    values.append(v)

            if not columns:
                if DEBUG:
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
                if DEBUG:
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
                if DEBUG:
                    print("➕ INSERT draft_project_articles SQL:", sql)
                    print("➕ VALUES:", insert_values)
                await conn.execute(sql, *insert_values)

        updated_count += 1

    await conn.close()

    # 🔔 EIN Remat-Trigger nach den DB-Writes:
    if sheet_name and str(sheet_name).startswith("materialized_elektrik_"):
        schedule_all_rematerialize(project_id)  # Elektrik-Edits ⇒ ALL (+Elektrik) ⇒ 1 Publish
    elif sheet_name:
        schedule_sheet_and_elektrik_rematerialize(project_id, sheet_name)  # Sheet+Elektrik ⇒ 1 Publish

    if DEBUG:
        print(f"✅ Edits gespeichert: {updated_count} Änderungen")

    return {
        "status": "ok",
        "count": updated_count,
        "log": f"✅ Edits gespeichert: {updated_count} Änderung(en)"
    }


@router.post("/rematerializeAll")
async def rematerialize_all(project_id: int = Query(...)):
    views_to_show = get_views_to_show(project_id)
    if DEBUG:
        print(f"[DEBUG] Rematerializing all materialized tables for project views: {views_to_show}")

    engine = sqlalchemy.create_engine(DB_URL)

    # Suffix holen
    with engine.connect() as conn:
        suffix = conn.execute(
            sqlalchemy.text(
                "SELECT project_materialized_name FROM projects WHERE id = :id"
            ),
            {"id": project_id},
        ).scalar_one()

    # Existierende materialized_*_{suffix} einsammeln
    insp = sqlalchemy.inspect(engine)
    existing = set(
        t for t in insp.get_table_names(schema="public")
        if t.startswith("materialized_") and t.endswith(f"_{suffix}")
    )

    # Nur wenn ELEKTRIK bereits existiert, darf der Elektrik-Rebuilder laufen
    has_elektrik = f"materialized_elektrik_{suffix}" in existing

    # parallel in Worker-Threads (Event-Loop bleibt frei)
    tasks = [asyncio.to_thread(refresh_all_materialized, project_id)]
    if has_elektrik:
        tasks.append(asyncio.to_thread(create_materialized_elektrik, project_id))
    await asyncio.gather(*tasks)

    # SSE-Event an alle Clients im Projekt
    publish(project_id, {"type": "remat_done", "scope": "all", "project_id": project_id})

    log = "🔁 + ⚡️ All materialized tables refreshed"
    if DEBUG:
        print(log)
    return {"status": "all_rematerialized", "log": log, "elektrik_refreshed": has_elektrik}


@router.get("/last_insert_id")
async def get_last_insert_id(request: Request):
    pool: asyncpg.Pool = request.app.state.db
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT last_id FROM inserted_id_meta WHERE id = 1
        """)
        return {"lastId": row["last_id"] if row else -1}


@router.post("/importOrUpdateArticles")
async def import_or_update_articles(request: Request):
    data = await request.json()
    selection = data.get("selection", [])
    if not selection:
        return {"status": "no_selection"}

    conn = await asyncpg.connect(DB_URL)

    meta = await conn.fetchrow("SELECT position_map FROM position_meta WHERE id = 429")
    position_map_raw = meta["position_map"] if meta else "[]"
    position_map = json.loads(position_map_raw)
    position_map.sort(key=lambda x: x["position"])

    ids = [
        entry["project_article_id"]
        for idx, entry in enumerate(position_map)
        if idx in selection
    ]
    if not ids:
        await conn.close()
        return {"status": "no_ids"}

    rows = await conn.fetch(
        "SELECT * FROM inserted_rows WHERE project_article_id = ANY($1::int[])", ids
    )

    meta = await conn.fetchrow("SELECT last_import_article_id FROM import_article_meta WHERE id = 1")
    last_import_id = meta["last_import_article_id"] if meta else -1

    article_cols_result = await conn.fetch("""
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'articles'
    """)
    article_columns = {r["column_name"]: r["data_type"] for r in article_cols_result}

    new_id = last_import_id
    inserted_count = 0
    updated_count = 0
    skipped_count = 0

    for row in rows:
        inserted = dict(row)
        project_article_id = inserted["project_article_id"]
        article_id = inserted.get("article_id")

        if article_id == "" or article_id is None:
            article_id = None
        else:
            try:
                article_id = int(article_id)
            except ValueError:
                article_id = None

        if not article_id:
            new_id -= 1
            cols = []
            vals = []
            for k, v in inserted.items():
                if k in article_columns and k != "id":
                    if v == "":
                        v = None
                    col_type = article_columns[k]
                    if col_type in ("text", "character varying") and v is not None:
                        v = str(v)
                    vals.append(v)
                    cols.append(f'"{k}"')

            cols.insert(0, "id")
            vals.insert(0, new_id)
            placeholders = [f"${i+1}" for i in range(len(vals))]
            sql = f"""
                INSERT INTO articles ({', '.join(cols)})
                VALUES ({', '.join(placeholders)})
            """
            await conn.execute(sql, *vals)
            await conn.execute("""
                UPDATE inserted_rows
                SET article_id = $1
                WHERE project_article_id = $2
            """, new_id, project_article_id)
            print(f"➕ Inserted new article {new_id}")
            inserted_count += 1

        elif article_id < 0:
            cols = []
            vals = []
            for k, v in inserted.items():
                if k in article_columns and k != "id":
                    if v == "":
                        v = None
                    col_type = article_columns[k]
                    if col_type in ("text", "character varying") and v is not None:
                        v = str(v)
                    cols.append(f'"{k}" = ${len(vals)+1}')
                    vals.append(v)

            if cols:
                sql = f"""
                    UPDATE articles
                    SET {', '.join(cols)}
                    WHERE id = ${len(vals)+1}::int
                """
                vals.append(int(article_id))
                await conn.execute(sql, *vals)
                print(f"✏️ Updated article {article_id}")
                updated_count += 1
            else:
                print(f"⚠️ Nothing to update for {article_id}")

        else:
            print(f"✔️ Skipped: article_id = {article_id}")
            skipped_count += 1

    await conn.execute("""
        UPDATE import_article_meta
        SET last_import_article_id = $1
        WHERE id = 1
    """, new_id)

    logs = []
    if inserted_count > 0:
        logs.append(f"➕ Inserted {inserted_count} new article(s)")
    if updated_count > 0:
        logs.append(f"✏️ Updated {updated_count} article(s)")

    await conn.close()
    return {
        "status": "done",
        "inserted": inserted_count,
        "updated": updated_count,
        "skipped": skipped_count,
        "new_last_id": new_id,
        "log": logs
    }
