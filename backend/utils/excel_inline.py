import re
from typing import List, Tuple


# ---------- Parsing & Normalisierung -----------------------------------------

def _normalize_display(s: str) -> str:
    # "\\\\\n" (drei Backslashes + 'n') -> echter Zeilenumbruch
    s = re.sub(r'\\{3}n', '\n', s)
    # "/n" am Zeilenanfang oder nach Whitespace -> \n
    s = re.sub(r'(^|\s)/n', r'\1\n', s)
    return s

def _parse_segments(s: str) -> List[Tuple[str, bool, bool]]:
    """
    Parsen von **bold** und *rot* in Text.
    Rückgabe: Liste aus (text, bold, red)
    - einfache State-Maschine; ** hat Vorrang vor *
    """
    s = _normalize_display(s or "")
    segs: List[Tuple[str, bool, bool]] = []
    bold = False
    red = False
    buf = []

    i = 0
    L = len(s)
    while i < L:
        if s.startswith("**", i):
            # toggle bold
            if buf:
                segs.append(("".join(buf), bold, red))
                buf = []
            bold = not bold
            i += 2
            continue
        if s[i] == "*":
            # toggle red
            if buf:
                segs.append(("".join(buf), bold, red))
                buf = []
            red = not red
            i += 1
            continue
        buf.append(s[i])
        i += 1

    if buf:
        segs.append(("".join(buf), bold, red))

    # Marker können unbalanciert sein -> wir lassen einfach den Status stehen; Text bleibt ok.
    return [seg for seg in segs if seg[0]]

def _strip_text(segs: List[Tuple[str, bool, bool]]) -> str:
    return "".join(t for t, _, _ in segs)

# ---------- Writer für XlsxWriter --------------------------------------------

def write_inline_xlsxwriter(ws, wb, row: int, col: int, value: str):
    """
    Robust für:
    - nur formatiert ("**Hello**" / "*Hello*")
    - gemischt ("**Hello** mate")
    - nur Plaintext
    """
    if not hasattr(ws, "write_rich_string"):
        ws.write(row, col, _normalize_display(value or ""))
        return

    segs = _parse_segments(value or "")
    if not segs:
        ws.write(row, col, "")
        return

    # Format-Cache
    cache = getattr(wb, "_inline_fmt_cache", None)
    if cache is None:
        cache = {}
        setattr(wb, "_inline_fmt_cache", cache)

    def _fmt(bold: bool, red: bool):
        key = (bold, red)
        fmt = cache.get(key)
        if fmt is None:
            fmt = wb.add_format()
            if bold:
                fmt.set_bold()
            if red:
                fmt.set_font_color("#dc2626")
            cache[key] = fmt
        return fmt

    # Fall: genau 1 Segment -> komplette Zelle formatiert oder plain
    if len(segs) == 1:
        text, b, r = segs[0]
        text = text or ""
        if b or r:
            ws.write(row, col, text, _fmt(b, r))
        else:
            ws.write(row, col, text)
        return

    # Mehrere Segmente -> "string, (format, string)*, string"
    parts = []
    plain_buf = ""
    for text, b, r in segs:
        text = text or ""
        if b or r:
            parts.append(plain_buf)       # kann leer sein; fixen wir gleich
            plain_buf = ""
            parts.extend([_fmt(b, r), text])
        else:
            plain_buf += text
    parts.append(plain_buf)

    # WICHTIG: erster/letzter String dürfen NICHT leer sein -> Zero-Width Space
    ZWSP = "\u200B"
    if not isinstance(parts[0], str) or parts[0] == "":
        parts[0] = ZWSP
    if not isinstance(parts[-1], str) or parts[-1] == "":
        parts[-1] = ZWSP

    try:
        ws.write_rich_string(row, col, *parts)
    except Exception:
        # Fallback: nie leer
        ws.write(row, col, _strip_text(segs))

# ---------- Writer für openpyxl ----------------------------------------------

def write_inline_openpyxl(ws, row: int, col: int, value: str):
    """
    ws: openpyxl.worksheet.worksheet.Worksheet
    Versucht RichText (openpyxl>=3.1). Fällt sonst auf Plaintext zurück.
    """
    cell = ws.cell(row=row, column=col)
    segs = _parse_segments(value or "")

    # Versuch: RichText
    try:
        from openpyxl.cell.rich_text import CellRichText, TextBlock
        from openpyxl.cell.text import InlineFont
        rt = CellRichText()
        for text, b, r in segs:
            font = InlineFont()
            if b:
                font.b = True
            if r:
                font.color = "FFDC2626"  # #dc2626
            rt.append(TextBlock(text=text, font=font))
        cell.value = rt
        return
    except Exception:
        pass

    # Fallback: nur unformatierten Text schreiben (keine falsche Vollformatierung)
    cell.value = _strip_text(segs)

# ---------- Front-Funktion (duck-typing) -------------------------------------

def write_inline(ws, wb_or_none, row: int, col: int, value: str):
    """
    Ein Entry-Point:
    - Wenn ws.write_rich_string existiert -> XlsxWriter
    - Wenn ws.cell existiert -> openpyxl
    """
    if hasattr(ws, "write_rich_string"):
        return write_inline_xlsxwriter(ws, wb_or_none, row, col, value)
    if hasattr(ws, "cell"):
        return write_inline_openpyxl(ws, row, col, value)
    # unbekanntes Backend
    text = _normalize_display(value or "")
    try:
        ws.write(row, col, text)  # vielleicht kompatibel
    except Exception:
        pass
