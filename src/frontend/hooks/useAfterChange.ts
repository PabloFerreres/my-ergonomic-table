import { addEdit, getUnsavedEdits } from "../editierung/EditMap";
import { sendEdits, sendPositionMap, fetchNextInsertedId } from "../utils/apiSync"; // <--- NEU importiert!
import { buildVisualPositionMap } from "../utils/BuildVisualPositionMap";
import type Handsontable from "handsontable";
import type { CellChange, ChangeSource } from "handsontable/common";

export function useAfterChange(
  data: (string | number)[][],
  rowIdIndex: number,
  colHeaders: string[],
  sheetName: string,
  hotInstance: Handsontable | null,
  isBlocked: boolean,
  projectId: number
) {
  return async (changes: CellChange[] | null, source: ChangeSource) => {
    if (!changes || source === "loadData") return;

    let changed = false;

    for (const [visualRow, prop, oldValue, newValue] of changes) {
      if (
        oldValue !== newValue &&
        (typeof prop === "string" || typeof prop === "number")
      ) {
        const physicalRow = hotInstance?.toPhysicalRow(visualRow) ?? visualRow;
        const row = data[physicalRow];
        let rowId = row[rowIdIndex];

        if (!rowId) {
          // Immer vom Backend holen!
          rowId = await fetchNextInsertedId();
          row[rowIdIndex] = rowId;

          addEdit({
            rowId,
            col: rowIdIndex,
            colName: colHeaders[rowIdIndex],
            oldValue: "",
            newValue: rowId,
            sheet: sheetName,
          });

          // PositionsMap nur, wenn nicht blockiert
          if (!isBlocked && hotInstance) {
            const posMap = buildVisualPositionMap(sheetName, hotInstance, colHeaders, data);
            if (posMap) sendPositionMap(posMap.sheet, posMap.rows, projectId);
          }
        }

        const colName = typeof prop === "number" ? colHeaders[prop] : String(prop);

        addEdit({
          rowId,
          col: prop,
          colName,
          oldValue,
          newValue,
          sheet: sheetName,
        });

        changed = true;
      }
    }

    if (changed) {
      const unsaved = getUnsavedEdits(sheetName);
      if (unsaved.length > 0) {
        console.log("📤 Sende Edits", unsaved);
        sendEdits(sheetName, unsaved, projectId);
      }
    }
  };
}
