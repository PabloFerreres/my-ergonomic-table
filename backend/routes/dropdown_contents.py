from fastapi import APIRouter, Query
import psycopg2, json
from backend.settings.connection_points import DB_URL, DEBUG

router = APIRouter()

def _parse_labels(payload) -> list[str]:
    if payload is None: return []
    try:
        data = payload if not isinstance(payload, str) else json.loads(payload)
    except Exception:
        return [s for s in payload.split("|") if isinstance(payload, str) and s]
    if isinstance(data, list):
        out = []
        for item in data:
            if isinstance(item, str): out.append(item)
            elif isinstance(item, dict):
                v = item.get("label") or item.get("text") or item.get("name") or item.get("value") or item.get("title")
                if isinstance(v, str) and v: out.append(v)
        return list(dict.fromkeys(out))
    if isinstance(data, dict):
        vals = [v for v in data.values() if isinstance(v, str) and v]
        return list(dict.fromkeys(vals if vals else list(data.keys())))
    return []

@router.get("/dropdownOptionsByHeaders")
def get_dropdown_options_by_headers(
    project_id: int = Query(...),
    header: list[str] = Query(...),
    debug: bool = Query(False)
) -> dict[str, list[str]]:
    def dbg(*args):
        if debug or DEBUG:
            print("[dropdownOptionsByHeaders]", *args)

    if not header:
        dbg("no headers provided")
        return {}

    headers_norm = [h.strip().lower() for h in header if h and h.strip()]
    dbg("incoming headers:", header, "normalized:", headers_norm)

    conn = psycopg2.connect(DB_URL); cur = conn.cursor()
    try:
        cur.execute("""
            SELECT
              c.id,
              c.name,
              c.name_external_german AS display_name,
              TRIM(COALESCE(c.name_external_german, c.name)) AS display_name_trim,
              TRIM(COALESCE(c.editor_type, '')) AS editor_type,
              TRIM(COALESCE(c.dropdown_source, '')) AS dropdown_source
            FROM columns c
            WHERE LOWER(TRIM(COALESCE(c.name_external_german, c.name))) = ANY(%s)
        """, (headers_norm,))
        cols = cur.fetchall()
        dbg("matched columns:", len(cols))
        for (col_id, name, display_name, display_name_trim, editor_type, source) in cols:
            dbg(f"- col_id={col_id} display='{display_name_trim}' editor_type='{editor_type}' source='{source}'")

        result: dict[str, list[str]] = {}
        me_cache: list[str] | None = None

        for col_id, name, display_name, display_name_trim, editor_type, source in cols:
            et = editor_type.lower()
            src = source.lower()
            if et != "dropdown":
                dbg(f"skip (not dropdown): {display_name_trim} et='{et}'")
                continue

            if src == "materialized_einbauorte":
                if me_cache is None:
                    cur.execute("""
                        SELECT full_name
                        FROM materialized_einbauorte
                        WHERE project_id = %s
                        ORDER BY full_name
                    """, (project_id,))
                    me_cache = [r[0] for r in cur.fetchall()]
                    dbg(f"materialized_einbauorte rows: {len(me_cache)} for project_id={project_id}")
                result[display_name_trim] = me_cache

            elif src == "dropdown_meta":
                cur.execute("SELECT dropdown_content FROM dropdown_meta WHERE column_id = %s", (col_id,))
                r = cur.fetchone()
                raw = r[0] if r else None
                labels = _parse_labels(raw)
                raw_preview = (raw[:120] + "...") if isinstance(raw, str) and len(raw) > 120 else raw
                dbg(f"dropdown_meta column_id={col_id} raw={raw_preview!r} → parsed {len(labels)} labels")
                result[display_name_trim] = labels

            else:
                dbg(f"unknown dropdown_source: '{src}' for {display_name_trim}")
                result[display_name_trim] = []

        # Keys für alle angefragten Header sicherstellen
        for h in header:
            result.setdefault(h.strip(), [])

        # Zusammenfassung
        for k, v in result.items():
            dbg(f"result[{k!r}] = {len(v)} items")

        return result
    finally:
        cur.close(); conn.close()
