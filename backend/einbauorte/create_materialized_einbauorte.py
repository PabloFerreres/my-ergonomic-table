async def fetch_tree(conn, project_id: int, parent_id=None, sort_nums=None, names=None):
    if sort_nums is None:
        sort_nums = []
    if names is None:
        names = []

    rows = await conn.fetch("""
        SELECT id, name, sort_order
        FROM stair_element_einbauorte
        WHERE parent_id IS NOT DISTINCT FROM $1 AND project_id = $2
        ORDER BY sort_order
    """, parent_id, project_id)

    result = []

    for r in rows:
        new_sort = sort_nums + [r["sort_order"]]
        new_names = names + [r["name"]]

        # Kinder?
        children = await conn.fetch("""
            SELECT id FROM stair_element_einbauorte
            WHERE parent_id = $1 AND project_id = $2
            LIMIT 1
        """, r["id"], project_id)

        if not children:  # Leaf
            pos = ".".join(str(x) for x in new_sort)
            name_path = " ".join(new_names)
            # ⬇️ ID zwischen Position und Name
            full_name = f"{pos} [{r['id']}] {name_path}"
            result.append({
                "id": r["id"],
                "project_id": project_id,
                "name": r["name"],
                "full_name": full_name,
            })
        else:
            result.extend(
                await fetch_tree(conn, project_id, r["id"], new_sort, new_names)
            )

    return result



async def rematerialize_project_einbauorte(conn, project_id: int) -> int:
    await conn.execute(
        "DELETE FROM materialized_einbauorte WHERE project_id = $1", project_id
    )

    all_entries = await fetch_tree(conn, project_id)

    for entry in all_entries:
        await conn.execute("""
            INSERT INTO materialized_einbauorte (id, project_id, name, full_name)
            VALUES ($1, $2, $3, $4)
        """, entry["id"], entry["project_id"], entry["name"], entry["full_name"])

    return len(all_entries)
