import { moveRow } from "../editierung/EditMap";
import { buildVisualPositionMap } from "../utils/BuildVisualPositionMap";
import { sendPositionMap } from "../utils/apiSync";
import type Handsontable from "handsontable";

export function useAfterRowMove(
  data: (string | number)[][],
  rowIdIndex: number,
  sheetName: string,
  hot: Handsontable | null,
  headers: string[]
) {
  return (
    movedRows: number[],
    finalIndex: number,
    _1: unknown,
    _2: unknown,
    orderChanged: boolean
  ) => {
    if (!orderChanged || !hot) return;

    // ✅ Präzise Filter- und Sort-Erkennung
    const filtersPlugin = hot.getPlugin("filters");
    const filterState = filtersPlugin?.exportConditions?.() ?? [];
    const filtersActive =
      Array.isArray(filterState) && filterState.some((c) => c.conditions?.length > 0);

    const sortPlugin = hot.getPlugin("columnSorting");
    const sortConfig = sortPlugin?.getSortConfig();
    const sortingActive = Array.isArray(sortConfig) && sortConfig.length > 0;

    if (filtersActive || sortingActive) {
      console.warn("⛔ PositionMap update blocked due to filter/sort");
      return;
    }


    // 1. Save row moves
    movedRows.forEach((visualRow) => {
      const rowId = data[visualRow][rowIdIndex];
      const newPos = finalIndex * 1000;
      moveRow(sheetName, rowId, newPos);
    });

    // 2. Build + send visual position map
    const map = buildVisualPositionMap(sheetName, hot, headers, data);
    if (map) sendPositionMap(map.sheet, map.rows);
  };
}
