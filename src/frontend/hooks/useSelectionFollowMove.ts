import { useCallback } from "react";
import type { HotTableClass } from "@handsontable/react";

type SelectionFollowMoveParams = {
  moveRowsUp: (rows: number[]) => void;
  moveRowsDown: (rows: number[]) => void;
  selectedRows: number[];
  selectedCell: { row: number; col: number } | null;
  setSelectedRows: (rows: number[]) => void;
  dataLength: number;
  hotRef: React.RefObject<HotTableClass | null>;
  selectionRange: {
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
  } | null;
};

export function useSelectionFollowMove({
  moveRowsUp,
  moveRowsDown,
  selectedRows,
  selectedCell,
  setSelectedRows,
  dataLength,
  hotRef,
  selectionRange,
}: SelectionFollowMoveParams) {
  const handleMoveUp = useCallback(() => {
    const rowsToMove =
      selectedRows.length > 0
        ? selectedRows
        : selectedCell
        ? [selectedCell.row]
        : [];
    if (!rowsToMove.length) return;
    moveRowsUp(rowsToMove);
    setSelectedRows(rowsToMove.map(idx => idx - 1).filter(idx => idx >= 0));

    // After moving, reselect block if present
    if (selectionRange && hotRef.current?.hotInstance) {
      hotRef.current.hotInstance.selectCell(
        Math.max(selectionRange.startRow - 1, 0),
        selectionRange.startCol,
        Math.max(selectionRange.endRow - 1, 0),
        selectionRange.endCol
      );
    } else if (selectedCell && hotRef.current?.hotInstance) {
      const newRow = Math.max(selectedCell.row - 1, 0);
      hotRef.current.hotInstance.selectCell(newRow, selectedCell.col);
    }
  }, [moveRowsUp, selectedRows, selectedCell, setSelectedRows, selectionRange, hotRef]);

  const handleMoveDown = useCallback(() => {
    const rowsToMove =
      selectedRows.length > 0
        ? selectedRows
        : selectedCell
        ? [selectedCell.row]
        : [];
    if (!rowsToMove.length) return;
    moveRowsDown(rowsToMove);
    setSelectedRows(
      rowsToMove.map(idx => idx + 1).filter(idx => idx < dataLength)
    );

    if (selectionRange && hotRef.current?.hotInstance) {
      hotRef.current.hotInstance.selectCell(
        Math.min(selectionRange.startRow + 1, dataLength - 1),
        selectionRange.startCol,
        Math.min(selectionRange.endRow + 1, dataLength - 1),
        selectionRange.endCol
      );
    } else if (selectedCell && hotRef.current?.hotInstance) {
      const newRow = Math.min(selectedCell.row + 1, dataLength - 1);
      hotRef.current.hotInstance.selectCell(newRow, selectedCell.col);
    }
  }, [moveRowsDown, selectedRows, selectedCell, setSelectedRows, dataLength, selectionRange, hotRef]);

  return { handleMoveUp, handleMoveDown };
}

