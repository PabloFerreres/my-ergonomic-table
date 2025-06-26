import {
  addEdit,
  getUnsavedEdits,
  getNextNegativeRowId,
} from "../editierung/EditMap";
import { sendEdits, sendPositionMap } from "../utils/apiSync";
import { buildVisualPositionMap } from "../utils/BuildVisualPositionMap";
import type Handsontable from "handsontable";
import type { CellChange, ChangeSource } from "handsontable/common";

export function useAfterChange(
  data: (string | number)[][],
  rowIdIndex: number,
  colHeaders: string[],
  sheetName: string,
  hotInstance: Handsontable | null,
  isBlocked: boolean // ✅ neu
) {
  return (changes: CellChange[] | null, source: ChangeSource) => {
    if (!changes || source === "loadData") return;

    let changed = false;

    changes.forEach(([visualRow, prop, oldValue, newValue]) => {
      if (
        oldValue !== newValue &&
        (typeof prop === "string" || typeof prop === "number")
      ) {
        const physicalRow = hotInstance?.toPhysicalRow(visualRow) ?? visualRow;
        const row = data[physicalRow];
        let rowId = row[rowIdIndex];

        if (!rowId) {
          rowId = getNextNegativeRowId();
          row[rowIdIndex] = rowId;

          addEdit({
            rowId,
            col: rowIdIndex,
            colName: colHeaders[rowIdIndex],
            oldValue: "",
            newValue: rowId,
            sheet: sheetName,
          });

          // ✅ automatische PositionsMap senden bei neuer Zeile
          if (!isBlocked && hotInstance) {
            const posMap = buildVisualPositionMap(sheetName, hotInstance, colHeaders, data);
            if (posMap) sendPositionMap(posMap.sheet, posMap.rows);
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
    });

    if (changed) {
      const unsaved = getUnsavedEdits(sheetName);
      if (unsaved.length > 0) {
        console.log("📤 Sende Edits", unsaved);
        sendEdits(sheetName, unsaved);
      }
    }
  };
}
