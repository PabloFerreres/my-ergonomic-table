# backend/layout/layout_estimation.py

from backend.layout.layout_constants import ROTATED_HEADER_LAYOUT, CELL_LAYOUT;
import math;
from backend.debug_config import DEBUG_FLAGS;

def estimate_rotated_header_width(text: str) -> int:
    if not text.strip():
        return ROTATED_HEADER_LAYOUT["padding"] + ROTATED_HEADER_LAYOUT["filter_icon_width"] + ROTATED_HEADER_LAYOUT["line_height"]

    max_chars = ROTATED_HEADER_LAYOUT["header_height"] // ROTATED_HEADER_LAYOUT["char_width"]
    words = text.strip().split()
    lines = []
    current_line = ""

    for word in words:
        proposed = f"{current_line} {word}".strip() if current_line else word
        if len(proposed) <= max_chars:
            current_line = proposed
        else:
            if current_line:
                lines.append(current_line)
            current_line = word
    if current_line:
        lines.append(current_line)

    return ROTATED_HEADER_LAYOUT["padding"] + len(lines) * ROTATED_HEADER_LAYOUT["line_height"] + ROTATED_HEADER_LAYOUT["filter_icon_width"]


def estimate_wrapped_cell_width(text: str, row_height: int, header: str) -> int:
    if not text.strip():
        return CELL_LAYOUT["empty_width"]

    max_lines = max(1, row_height // CELL_LAYOUT["line_height"])
    min_chars_per_line = math.ceil(len(text) / max_lines)
    estimated_width = CELL_LAYOUT["padding"] + min_chars_per_line * CELL_LAYOUT["cell_char_width"]
    if DEBUG_FLAGS.get("layout_estimation"): 
        print(f"🔍 Checking header: >{repr(header)}< | stripped: >{header.strip()}<")

    if header.strip() == "Bestellbezeichnung":
        max_allowed_width = CELL_LAYOUT["max_exception_width"]
        if DEBUG_FLAGS.get("layout_estimation"): 
            print("✅ Using exception max width!")
    else:
        if DEBUG_FLAGS.get("layout_estimation"):
            print(f"❌ Did not match: {repr(header)}")
        max_allowed_width = CELL_LAYOUT["max_width"]


    return min(estimated_width, max_allowed_width)


def estimate_row_height_for_cells(row: list[str | int], headers: list[str]) -> int:
    max_height = CELL_LAYOUT["line_height"]

    for i, cell in enumerate(row):
        header = headers[i].strip()

        if header == "Bestellbezeichnung":
            max_allowed_width = CELL_LAYOUT["max_exception_width"]
        else:
            max_allowed_width = CELL_LAYOUT["max_width"]

        text = str(cell).strip()
        chars_per_line = max(1, max_allowed_width // CELL_LAYOUT["cell_char_width"])
        line_count = math.ceil(len(text) / chars_per_line)
        height = line_count * CELL_LAYOUT["line_height"] + CELL_LAYOUT["padding"]
        max_height = max(max_height, height)

    return max_height
