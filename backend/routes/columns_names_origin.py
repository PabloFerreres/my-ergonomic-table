import sys
import os
if __name__ == "__main__":
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from fastapi import APIRouter
import asyncpg
from backend.settings.connection_points import DB_URL

router = APIRouter()

@router.get("/columns_map")
async def get_columns_map():
    conn = await asyncpg.connect(DB_URL)
    # Get all columns from project_articles and articles
    result = await conn.fetch("""
        SELECT c.name, c.name_external_german, 'project_articles' AS table_name
        FROM columns c
        WHERE c.name IN (
            SELECT column_name FROM information_schema.columns WHERE table_name = 'project_articles'
        )
        UNION
        SELECT c.name, c.name_external_german, 'articles' AS table_name
        FROM columns c
        WHERE c.name IN (
            SELECT column_name FROM information_schema.columns WHERE table_name = 'articles'
        )
    """)
    await conn.close()
    # Group by column name, collect tables
    col_map = {}
    for row in result:
        name = row["name"]
        ext = row["name_external_german"]
        tbl = row["table_name"]
        if name not in col_map:
            col_map[name] = {
                "name": name,
                "name_external_german": ext,
                "tables": [tbl]
            }
        else:
            if tbl not in col_map[name]["tables"]:
                col_map[name]["tables"].append(tbl)
    return list(col_map.values())

if __name__ == "__main__":
    import asyncio
    async def debug():
        result = await get_columns_map()
        from pprint import pprint
        pprint(result)
        # Check for unmatched columns
        import asyncpg
        conn = await asyncpg.connect(DB_URL)
        unmatched = []
        for tbl in ["project_articles", "articles"]:
            db_cols = await conn.fetch(f"SELECT column_name FROM information_schema.columns WHERE table_name = '{tbl}'")
            db_col_names = set(row["column_name"] for row in db_cols)
            mapped_names = set(r["name"] for r in result if tbl in r["tables"])
            for col in db_col_names:
                if col not in mapped_names:
                    unmatched.append((tbl, col))
        # Check for columns in columns table not present in DB tables
        for tbl in ["project_articles", "articles"]:
            db_cols = await conn.fetch(f"SELECT column_name FROM information_schema.columns WHERE table_name = '{tbl}'")
            db_col_names = set(row["column_name"] for row in db_cols)
            mapped_names = set(r["name"] for r in result if tbl in r["tables"])
            # Already checked DB->columns above
            # Now check columns->DB
            for mapped_name in mapped_names:
                if mapped_name not in db_col_names:
                    print(f"[WARNING] Column in columns table but not in {tbl}: {mapped_name}")
        await conn.close()
        if unmatched:
            print("\n[WARNING] Unmatched columns:")
            for tbl, col in unmatched:
                print(f"  Table: {tbl}, Column: {col}")
        else:
            print("\nAll columns matched.")
    asyncio.run(debug())
