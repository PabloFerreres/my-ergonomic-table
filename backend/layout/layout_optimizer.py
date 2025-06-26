# backend/layout/layout_optimizer.py

from backend.layout.layout_estimation import (
    estimate_rotated_header_width,
    estimate_wrapped_cell_width,
    estimate_row_height_for_cells,
)
from typing import List, Dict, Union
from backend.debug_config import DEBUG_FLAGS


def optimize_table_layout(
    headers: List[str],
    data: List[List[Union[str, int]]],
    max_row_height: int = 200
) -> Dict[str, Union[Dict[str, int], Dict[int, int]]]:
    """
    Estimate optimal layout dimensions for a given table.
    Returns column widths and row heights.
    """

    # Step 1: Estimate row heights
    row_heights: Dict[int, int] = {}
    # inside optimize_table_layout
    for i, row in enumerate(data):
        height = estimate_row_height_for_cells(row, headers)
        row_heights[i] = min(height, max_row_height)


    # Step 2: Estimate cell widths (based on vertical space of each row)
    cell_widths_by_col: Dict[int, List[int]] = {i: [] for i in range(len(headers))}
    for row_index, row in enumerate(data):
        row_height = row_heights[row_index]
        for col_index, cell in enumerate(row):
            width = estimate_wrapped_cell_width(str(cell), row_height, headers[col_index])
            cell_widths_by_col[col_index].append(width)

    # Step 3: Determine final column widths (max cell width vs. header)
    column_widths: Dict[str, int] = {}
    for col_index, header in enumerate(headers):
        max_cell_width = max(cell_widths_by_col[col_index])
        header_width = estimate_rotated_header_width(header)
        column_widths[header] = max(max_cell_width, header_width)


        if DEBUG_FLAGS.get("layout_optimizer"):
            if header.strip() == "Kommentar":
                print(f"🔍 Debugging 'Kommentar' column:")
                print(f"→ max_cell_width: {max_cell_width}")
                print(f"→ header_width: {header_width}")
                print(f"→ final selected width: {column_widths}")
                print("→ individual cell widths (row → width):")
                for row_idx, width in enumerate(cell_widths_by_col[col_index]):
                    print(f"  Row {row_idx}: {width}")

    return {
        "columnWidths": column_widths,
        "rowHeights": row_heights
    }


# Optional: test runner
if __name__ == "__main__":
 from typing import List, Union

headers = ["Name", "Beschreibung", "Notizen"]
data: List[List[Union[str, int]]] = [  # 👈 expliziter Typ
    ["Karton", "Große Verpackung für Produkte", "Lager 1"],
    ["Flasche", "Kunststoff, 1 Liter", ""],
    ["Box", "Aufbewahrungseinheit mit Fächern", "Wird selten verwendet"]
]