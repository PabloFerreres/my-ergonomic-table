def get_and_decrement_last_id(cursor):
    cursor.execute("""
        UPDATE inserted_id_meta
        SET last_id = last_id - 1
        WHERE id = 1
        RETURNING last_id
    """)
    res = cursor.fetchone()
    return res[0] if res else None