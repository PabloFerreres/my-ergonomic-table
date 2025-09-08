# backend/export/excel_export.py
from io import BytesIO
from pathlib import Path
from typing import Optional, Any, Tuple, Dict, List
import json
import re
import xlsxwriter  # pip install xlsxwriter

# Inline-Writer für **fett** und *rot* (setzt echte Zellteilformate)
from backend.utils.excel_inline import write_inline

# Pfad zur Color-Map
REPO_ROOT = Path(__file__).resolve().parents[2]
STYLE_PATH = REPO_ROOT / "src" / "frontend" / "visualization" / "Formating" / "columnsForm" / "ColumnStyleMap.json"
if not STYLE_PATH.exists():
    raise FileNotFoundError(f"ColumnStyleMap.json not found at {STYLE_PATH}")

# Höhen/Styling
HEADER_HEIGHT_PT = 28               # normale Headerhöhe
HEADER_HEIGHT_ROTATED_PT = 84       # Headerhöhe bei rotierten Überschriften
DATA_ROW_HEIGHT_PT = 18             # einheitliche Datenzeilenhöhe

def _norm_hex(s: Optional[str]) -> Optional[str]:
    if not s:
        return None
    s = s.strip().upper()
    if not s.startswith("#"):
        return None
    if len(s) == 4:  # #RGB
        r, g, b = s[1], s[2], s[3]
        return f"#{r}{r}{g}{g}{b}{b}"
    if len(s) == 7:  # #RRGGBB
        return s
    return None

def _rel_luma(hex6: str) -> float:
    if not (hex6 and hex6.startswith("#") and len(hex6) == 7):
        return 1.0
    r = int(hex6[1:3], 16)
    g = int(hex6[3:5], 16)
    b = int(hex6[5:7], 16)
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0

def _load_style_map() -> Tuple[Dict[str, str], str, str]:
    m = json.loads(STYLE_PATH.read_text(encoding="utf-8"))
    header_color_by_name: Dict[str, str] = {}
    for k, v in m.items():
        if k.startswith("header-") and isinstance(v, dict) and "headers" in v:
            color = _norm_hex(v.get("color"))
            if color is None:
                continue
            for h in v.get("headers") or []:
                header_color_by_name[str(h)] = color
    header_rows_bg = _norm_hex((m.get("grid-header-rows") or {}).get("color")) or "#E5E7EB"
    inbetween_red  = _norm_hex((m.get("grid-inbetween-red") or {}).get("color")) or "#FF0000"
    return header_color_by_name, header_rows_bg, inbetween_red

def _fmt(
    wb,
    cache: Dict[tuple, Any],
    *,
    bg: Optional[str] = None,
    fg: Optional[str] = None,
    bold: bool = False,
    align: Optional[str] = None,
    font_size: Optional[int] = None,
    rotation: Optional[int] = None,    # 0..180
    text_wrap: Optional[bool] = None,
):
    key = (bg, fg, bold, align, font_size, rotation, text_wrap)
    if key in cache:
        return cache[key]
    spec: Dict[str, Any] = {}
    if bg is not None:
        spec["bg_color"] = bg
    if fg is not None:
        spec["font_color"] = fg
    if bold:
        spec["bold"] = True
    if align is not None:
        spec["align"] = align
    spec["valign"] = "vcenter"
    if font_size is not None:
        spec["font_size"] = font_size
    if rotation is not None:
        spec["rotation"] = rotation
    if text_wrap is not None:
        spec["text_wrap"] = text_wrap
    fmt = wb.add_format(spec)
    cache[key] = fmt
    return fmt

def _len_cell(v: Any) -> int:
    if v is None:
        return 0
    s = str(v)
    if not s:
        return 0
    return max(len(line) for line in s.splitlines())

def _autosize_from_values_only(headers: List[Any], data: List[List[Any]]) -> List[float]:
    """Zeichenbreiten nur aus den Werten, min/max + Padding."""
    n_cols = len(headers)
    maxlens = [0.0] * n_cols
    for row in data:
        for c in range(n_cols):
            val = row[c] if c < len(row) else ""
            maxlens[c] = max(maxlens[c], float(_len_cell(val)))
    widths = []
    for L in maxlens:
        w = L + 2.0  # Padding
        if w < 6.0: w = 6.0
        if w > 80.0: w = 80.0
        widths.append(w)
    return widths

# Anzeige-Normalisierung & Marker-Strip (für Header-Zeilen)
_BOLD_RE = re.compile(r"\*\*(.+?)\*\*")
_RED_RE  = re.compile(r"\*(.+?)\*")

def _normalize_display(s: str) -> str:
    s = re.sub(r'\\{3}n', '\n', s or "")
    s = re.sub(r'(^|\s)/n', r'\1\n', s)
    return s

def _strip_markers(s: str) -> str:
    s = _normalize_display(s or "")
    s = _BOLD_RE.sub(r"\1", s)
    s = _RED_RE.sub(r"\1", s)
    return s

def build_excel(payload: dict) -> bytes:
    """
    payload = {
      "filename": "Projekt_123.xlsx",
      "sheets": [
        { "name": "Elektrik", "headers": [...], "data": [[...],...],
          "layout": {"columnWidths": {...}, "rowHeights": {...}}
        }
      ]
    }
    """
    header_color_by_name, header_rows_bg, _inbetween_red = _load_style_map()

    mem = BytesIO()
    wb = xlsxwriter.Workbook(mem, {"in_memory": True})
    cache: Dict[tuple, Any] = {}

    for sheet in payload.get("sheets", []):
        name    = str(sheet.get("name", "Sheet"))[:31]
        headers = list(sheet.get("headers") or [])
        data    = list(sheet.get("data") or [])

        ws = wb.add_worksheet(name)

        # Default-Zellformat: linksbündig für alle Werte
        default_left = _fmt(wb, cache, align="left")

        # 1) Spaltenbreiten nur aus Werten
        widths = _autosize_from_values_only(headers, data)
        for c, w in enumerate(widths):
            ws.set_column(c, c, w, default_left)

        # 2) Header-Rotation, wenn Header länger als Wertbreite
        rotate_flags: List[bool] = []
        for c, h in enumerate(headers):
            hdr_len = _len_cell(h)
            rotate_flags.append(hdr_len > (widths[c] - 1.5))

        # 3) Zeilenhöhen: einheitliche Datenhöhe; Headerhöhe abhängig von Rotation
        ws.set_default_row(DATA_ROW_HEIGHT_PT)  # alle Datenzeilen gleich hoch
        header_height_pt = HEADER_HEIGHT_ROTATED_PT if any(rotate_flags) else HEADER_HEIGHT_PT
        ws.set_row(0, header_height_pt)

        # 4) Header schreiben (Farben, Größe, Rotation)
        for c, h in enumerate(headers):
            bg = header_color_by_name.get(str(h))
            if rotate_flags[c]:
                if bg:
                    fg = "#000000" if _rel_luma(bg) > 0.6 else "#FFFFFF"
                    fmt = _fmt(wb, cache, bg=bg, fg=fg, bold=True, align="center", font_size=12, rotation=90)
                else:
                    fmt = _fmt(wb, cache, bold=True, align="center", font_size=12, rotation=90)
            else:
                if bg:
                    fg = "#000000" if _rel_luma(bg) > 0.6 else "#FFFFFF"
                    fmt = _fmt(wb, cache, bg=bg, fg=fg, bold=True, align="left", font_size=14)
                else:
                    fmt = _fmt(wb, cache, bold=True, align="left", font_size=14)
            ws.write(0, c, h, fmt)

        # Freeze + Autofilter
        ws.freeze_panes(1, 0)
        if headers:
            ws.autofilter(0, 0, 0, len(headers) - 1)

        # 5) Daten schreiben:
        #    - HEADER-Zeilen: Hintergrund + Bold aus StyleMap, Marker entfernt
        #    - sonst: Rich-Text via write_inline(**fett**, *rot*)
        kommentar_idx = next((i for i, hh in enumerate(headers) if str(hh).lower() == "kommentar"), -1)
        fmt_header_row = _fmt(wb, cache, bg=header_rows_bg, fg="#000000", bold=True, align="left")

        for r, row in enumerate(data, start=1):
            is_header_row = False
            if kommentar_idx >= 0 and kommentar_idx < len(row):
                v = row[kommentar_idx]
                is_header_row = (isinstance(v, str) and v.strip().upper() == "HEADER")

            for c, val in enumerate(row):
                if is_header_row:
                    txt = _strip_markers(str(val) if val is not None else "")
                    ws.write(r, c, txt, fmt_header_row)
                else:
                    write_inline(ws, wb, r, c, str(val) if val is not None else "")

    wb.close()
    return mem.getvalue()
