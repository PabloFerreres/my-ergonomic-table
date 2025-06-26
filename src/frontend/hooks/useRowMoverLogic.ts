import type Handsontable from "handsontable";

export function useRowMoverLogic(hot: Handsontable | null) {
  const isBlocked = (): boolean => {
    if (!hot) return true;

    const filters = hot.getPlugin("filters");
    const sorting = hot.getPlugin("columnSorting");

    const sortConfig = sorting?.getSortConfig?.();
    const sortingActive = Array.isArray(sortConfig) && sortConfig.length > 0;

    let filteringActive = false;
    if (filters?.isEnabled?.()) {
      const conditions = filters.exportConditions?.();
      filteringActive = Array.isArray(conditions) && conditions.length > 0;
    }

    return sortingActive || filteringActive;
  };

  const moveRows = (
    rows: number[],
    direction: "up" | "down",
    selectedCol: number
  ) => {
    if (!hot || rows.length === 0 || isBlocked()) return;

    const plugin = hot.getPlugin("manualRowMove");
    const offset = direction === "up" ? -1 : 1;

    const validRows = rows
      .map((r) => r + offset)
      .filter((r) => r >= 0 && r < hot.countRows());

    if (validRows.length !== rows.length) return;

    rows.forEach((row) => {
      plugin.moveRow(row, row + offset);
      hot.runHooks("afterRowMove", [row], row + offset, undefined, true);
    });

    hot.render();

    const focusRow =
      direction === "up" ? rows[0] - 1 : rows[rows.length - 1] + 1;
    hot.selectCell(focusRow, selectedCol);
  };

  return {
    moveRowsUp: (rows: number[], col: number) => moveRows(rows, "up", col),
    moveRowsDown: (rows: number[], col: number) => moveRows(rows, "down", col),
  };
}
