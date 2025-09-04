import re
import unicodedata
import psycopg2
from backend.settings.connection_points import DB_URL
from backend.loading.create_materialized_tables import create_materialized_table
from backend.central_managers.inserted_id_central_manager import get_and_decrement_last_id

# ----- Helpers ---------------------------------------------------------------

def _latinize(s: str) -> str:
    repl = (("ä","ae"),("ö","oe"),("ü","ue"),("Ä","Ae"),("Ö","Oe"),("Ü","Ue"),("ß","ss"))
    for a, b in repl:
        s = s.replace(a, b)
    s = unicodedata.normalize("NFKD", s)
    return s.encode("ascii", "ignore").decode("ascii")

def _normalize_view_name(display_name: str) -> str:
    """
    'Test For Deletion!!' -> 'test_for_deletion'
    - lowercase, nur [a-z0-9_], kein führender Digit, max 63 Zeichen
    """
    s = _latinize((display_name or "").strip()).lower()
    s = re.sub(r"[^a-z0-9]+", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    if not s:
        s = "sheet"
    if s[0].isdigit():
        s = f"v_{s}"
    return s[:63]

def _ensure_unique_view_name(cursor, project_id: int, base: str) -> str:
    cursor.execute("SELECT lower(name) FROM views WHERE project_id=%s", (project_id,))
    existing = {row[0] for row in cursor.fetchall()}
    if base not in existing:
        return base
    i = 2
    while True:
        suf = f"_{i}"
        cand = base[: (63 - len(suf))] + suf
        if cand not in existing:
            return cand
        i += 1

def get_project_name(cursor, project_id):
    # bleibt für Backwards-Compat erhalten (falls anderswo benutzt)
    cursor.execute("SELECT name FROM projects WHERE id=%s", (project_id,))
    res = cursor.fetchone()
    return res[0] if res else None

def _get_project_suffix(cursor, project_id):
    # für materialized_*_SUFFIX (wie in /sheetnames)
    cursor.execute("SELECT project_materialized_name FROM projects WHERE id=%s", (project_id,))
    res = cursor.fetchone()
    return res[0] if res else None

# ----- Public API ------------------------------------------------------------

def create_sheet_full(display_name, base_view_id, project_id):
    """
    Lege neuen View an + Welcome-Zeile + Materialized Table + position_meta + multiproject_meta_datas.
    - display_name: UI-Name (wie eingegeben, getrimmt)
    - name        : stabiler, normalisierter Identifier (lower_snake_case), projektweit eindeutig
    """
    conn = None
    try:
        conn = psycopg2.connect(DB_URL)
        cursor = conn.cursor()

        # Existenzcheck (Display-Name pro Projekt)
        cursor.execute(
            "SELECT id FROM views WHERE display_name=%s AND project_id=%s",
            (display_name, project_id)
        )
        if cursor.fetchone():
            cursor.close()
            conn.close()
            return False, {"error": "Display name already exists"}

        # Stabilen internen Namen bestimmen (nicht mehr UPPER)
        base_name = _normalize_view_name(display_name)
        name = _ensure_unique_view_name(cursor, project_id, base_name)

        # View anlegen
        cursor.execute(
            "INSERT INTO views (project_id, name, display_name, base_view_id) VALUES (%s, %s, %s, %s) RETURNING id",
            (project_id, name, display_name.strip(), base_view_id)
        )
        result = cursor.fetchone()
        if result is None:
            cursor.close()
            conn.close()
            return False, {"error": "View insert failed"}
        view_id = result[0]
        conn.commit()  # beibehalten wie zuvor

        # Sheet-Name generieren (Suffix aus project_materialized_name)
        suffix = _get_project_suffix(cursor, project_id)
        if not suffix:
            # Fallback: alter Projektname (nur falls Spalte nicht gepflegt)
            fallback = get_project_name(cursor, project_id) or f"project{project_id}"
            suffix = _normalize_view_name(fallback)
        sheet_name = f"materialized_{name}_{suffix.lower()}"

        # 1. next inserted_id holen (negativ)
        welcome_id = get_and_decrement_last_id(cursor)

        # 2. Welcome-Zeile in inserted_rows einfügen
        cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'inserted_rows'")
        columns = [r[0] for r in cursor.fetchall()]
        if "project_id" in columns:
            cursor.execute(
                """
                INSERT INTO inserted_rows (project_article_id, Kommentar, project_id)
                VALUES (%s, %s, %s)
                """,
                (welcome_id, "Willkommen! Tragen Sie hier Ihre erste Zeile ein.", project_id)
            )
        else:
            cursor.execute(
                """
                INSERT INTO inserted_rows (project_article_id, Kommentar)
                VALUES (%s, %s)
                """,
                (welcome_id, "Willkommen! Tragen Sie hier Ihre erste Zeile ein.")
            )

        # 3. Materialized-Tabelle erstellen (intern nutzt view_id/base_view_id)
        create_materialized_table(project_id, view_id, base_view_id)

        # 4. position_meta initial
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

        # 5. multiproject_meta_datas anlegen
        cursor.execute(
            "INSERT INTO multiproject_meta_datas (project_id, view_id, position_meta_id) VALUES (%s, %s, %s)",
            (project_id, view_id, position_meta_id)
        )
        conn.commit()

        # last_id holen
        cursor.execute("SELECT last_id FROM inserted_id_meta WHERE id = 1")
        last_id_result = cursor.fetchone()
        last_id = last_id_result[0] if last_id_result else None

        cursor.close()
        conn.close()
        return True, {
            "view_id": view_id,
            "sheet_name": sheet_name,
            "last_id": last_id,
            "welcome_id": welcome_id,
        }

    except Exception as e:
        if conn:
            try:
                conn.rollback()
                conn.close()
            except Exception:
                pass
        return False, {"error": str(e)}
