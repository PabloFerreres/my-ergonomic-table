# backend/utils/sheet_create_utils.py

import psycopg2
from backend.settings.connection_points import DB_URL
from backend.loading.create_materialized_tables import create_materialized_table
from  backend.central_managers.inserted_id_central_manager import get_and_decrement_last_id

def get_project_name(cursor, project_id):
    cursor.execute("SELECT name FROM projects WHERE id=%s", (project_id,))
    res = cursor.fetchone()
    return res[0] if res else None

def get_and_increment_last_id(cursor):
    # Lese den aktuellen Wert und erhöhe ihn atomar
    cursor.execute("""
        UPDATE inserted_id_meta
        SET last_id = last_id + 1
        WHERE id = 1
        RETURNING last_id
    """)
    res = cursor.fetchone()
    return res[0] if res else None

def create_sheet_full(display_name, base_view_id, project_id):
    """
    Lege neuen View an + Materialized Table + position_meta + multiproject_meta_datas.
    Außerdem erste Welcome-Zeile als Dummy.
    """
    conn = None
    try:
        conn = psycopg2.connect(DB_URL)
        cursor = conn.cursor()
        name = display_name.upper()

        # Existenzcheck
        cursor.execute(
            "SELECT id FROM views WHERE display_name=%s AND project_id=%s",
            (display_name, project_id)
        )
        if cursor.fetchone():
            cursor.close()
            conn.close()
            return False, {"error": "Display name already exists"}

        # View anlegen
        cursor.execute(
            "INSERT INTO views (project_id, name, display_name, base_view_id) VALUES (%s, %s, %s, %s) RETURNING id",
            (project_id, name, display_name, base_view_id)
        )
        result = cursor.fetchone()
        if result is None:
            cursor.close()
            conn.close()
            return False, {"error": "View insert failed"}
        view_id = result[0]
        conn.commit()

        # Materialized-Tabelle (leere Struktur – Spalten werden erstellt)
        create_materialized_table(project_id, view_id, base_view_id)

        # Sheet-Name generieren
        project_name = get_project_name(cursor, project_id)
        if not project_name:   # Fallback, falls None
            project_name = f"project{project_id}"
        sheet_name = f"materialized_{name.lower()}_{project_name.lower()}"

        # 1. next inserted_id holen und erhöhen
        welcome_id = get_and_decrement_last_id(cursor)

        # 2. Welcome-Zeile in inserted_rows einfügen (nur Beispiel-Spalten, je nach Modell anpassen!)
        cursor.execute("""
            INSERT INTO inserted_rows (project_article_id, Kommentar)
            VALUES (%s, %s)
        """, (welcome_id, "Willkommen! Tragen Sie hier Ihre erste Zeile ein."))

        # 3. position_meta: map mit Welcome-Zeile
        pos_map = [{
            "project_article_id": welcome_id,
            "Kommentar": "Willkommen! Tragen Sie hier Ihre erste Zeile ein.",
            "position": 1
        }]
        import json
        cursor.execute(
            "INSERT INTO position_meta (sheet_name, position_map) VALUES (%s, %s) RETURNING id",
            (sheet_name, json.dumps(pos_map))
        )
        pos_result = cursor.fetchone()
        if pos_result is None:
            cursor.close()
            conn.close()
            return False, {"error": "position_meta insert failed"}
        position_meta_id = pos_result[0]

        # 4. multiproject_meta_datas anlegen
        cursor.execute(
            "INSERT INTO multiproject_meta_datas (project_id, view_id, position_meta_id) VALUES (%s, %s, %s)",
            (project_id, view_id, position_meta_id)
        )
        conn.commit()

        # Gebe last_id an Frontend zurück, damit alles synchron bleibt
        cursor.execute("SELECT last_id FROM inserted_id_meta WHERE id = 1")
        last_id_result = cursor.fetchone()
        last_id = last_id_result[0] if last_id_result else None

        cursor.close()
        conn.close()
        return True, {
            "view_id": view_id,
            "sheet_name": sheet_name,
            "last_id": last_id,  # Für das Frontend!
            "welcome_id": welcome_id,
        }

    except Exception as e:
        if conn:
            conn.close()
        return False, {"error": str(e)}
