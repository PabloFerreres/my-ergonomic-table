import { useState, useCallback } from "react";

// Tracks the active cell and all selected rows (for multi-row/cell selection)
export function useTableSelection() {
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [selectionRange, setSelectionRange] = useState<{
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
  } | null>(null);

  // Handles selection from Handsontable (afterSelection hook)
  const handleAfterSelection = useCallback(
    (row: number, col: number, row2: number, col2: number) => {
      setSelectedCell({ row, col });
      // Multi-cell/row selection: collect all rows in the selected block
      const start = Math.min(row, row2);
      const end = Math.max(row, row2);
      const rows: number[] = [];
      for (let i = start; i <= end; i++) rows.push(i);
      setSelectedRows(rows);

      setSelectionRange({
        startRow: Math.min(row, row2),
        startCol: Math.min(col, col2),
        endRow: Math.max(row, row2),
        endCol: Math.max(col, col2),
      });
    },
    []
  );

  return {
    selectedCell,
    selectedRows,
    selectionRange,          // <-- typo fixed
    handleAfterSelection,
    setSelectedRows,
    setSelectedCell,
    setSelectionRange,       // <-- typo fixed
  };
}
