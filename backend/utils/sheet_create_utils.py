import re
import unicodedata
import json
import psycopg2
from backend.settings.connection_points import DB_URL
from backend.loading.create_materialized_tables import create_materialized_table

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
    cursor.execute("SELECT name FROM projects WHERE id=%s", (project_id,))
    res = cursor.fetchone()
    return res[0] if res else None

def _get_project_suffix(cursor, project_id):
    cursor.execute("SELECT project_materialized_name FROM projects WHERE id=%s", (project_id,))
    res = cursor.fetchone()
    return res[0] if res else None

# ----- Public API ------------------------------------------------------------

def create_sheet_full(display_name, base_view_id, project_id):
    """
    Neuer View:
    - legt View an
    - schreibt leere position_meta (20 Platzhalterzeilen, position 1..20)
    - verknüpft multiproject_meta_datas
    - erzeugt materialized_* basierend auf position_meta
    """
    conn = None
    try:
        conn = psycopg2.connect(DB_URL)
        cursor = conn.cursor()

        # 0) Display-Name-Guard
        cursor.execute(
            "SELECT id FROM views WHERE display_name=%s AND project_id=%s",
            (display_name, project_id)
        )
        if cursor.fetchone():
            cursor.close()
            conn.close()
            return False, {"error": "Display name already exists"}

        # 1) stabilen internen Namen bestimmen
        base_name = _normalize_view_name(display_name)
        name = _ensure_unique_view_name(cursor, project_id, base_name)

        # 2) View anlegen
        cursor.execute(
            "INSERT INTO views (project_id, name, display_name, base_view_id) VALUES (%s, %s, %s, %s) RETURNING id",
            (project_id, name, display_name.strip(), base_view_id)
        )
        row = cursor.fetchone()
        if not row:
            cursor.close()
            conn.close()
            return False, {"error": "View insert failed"}
        view_id = row[0]
        conn.commit()

        # 3) sheet_name bilden
        suffix = _get_project_suffix(cursor, project_id)
        if not suffix:
            fallback = get_project_name(cursor, project_id) or f"project{project_id}"
            suffix = _normalize_view_name(fallback)
        sheet_name = f"materialized_{name}_{suffix.lower()}"

        # 4) position_meta: 20 leere Zeilen (keine IDs!), position 1..20
        position_map = [{
            "project_article_id": None,
            "position": i
        } for i in range(1, 21)]

        cursor.execute(
            "INSERT INTO position_meta (sheet_name, position_map) VALUES (%s, %s) RETURNING id",
            (sheet_name, json.dumps(position_map))
        )
        pos_res = cursor.fetchone()
        if not pos_res:
            cursor.close()
            conn.close()
            return False, {"error": "position_meta insert failed"}
        position_meta_id = pos_res[0]

        # Set position_meta_id in views
        cursor.execute(
            "UPDATE views SET position_meta_id = %s WHERE id = %s",
            (position_meta_id, view_id)
        )
        conn.commit()

        # 5) multiproject_meta_datas verknüpfen
        cursor.execute(
            "INSERT INTO multiproject_meta_datas (project_id, view_id, position_meta_id) VALUES (%s, %s, %s)",
            (project_id, view_id, position_meta_id)
        )
        conn.commit()

        # 6) materialized_* erzeugen (baut aus position_meta => sofort 20 leere Zeilen sichtbar)
        create_materialized_table(project_id, view_id, base_view_id)

        # 7) last_id nur lesen
        cursor.execute("SELECT last_id FROM inserted_id_meta WHERE id = 1")
        last_id_row = cursor.fetchone()
        last_id = last_id_row[0] if last_id_row else None

        cursor.close()
        conn.close()
        return True, {
            "view_id": view_id,
            "sheet_name": sheet_name,
            "last_id": last_id,
            "welcome_id": None,  # Backcompat
        }

    except Exception as e:
        if conn:
            try:
                conn.rollback()
                conn.close()
            except Exception:
                pass
        return False, {"error": str(e)}
