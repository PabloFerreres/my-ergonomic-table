import { addEdit, getUnsavedEdits } from "../editierung/EditMap";
import { sendEdits, sendPositionMap, fetchNextInsertedId } from "../utils/apiSync";
import { buildVisualPositionMap } from "../utils/BuildVisualPositionMap";
import type Handsontable from "handsontable";
import type { CellChange, ChangeSource } from "handsontable/common";

// ✅ FIX: beliebig viele Ziffern aus "[123]" ziehen
const idFromEinbauortLabel = (v: unknown): number | "" => {
  if (v == null || v === "") return "";
  if (typeof v === "number") return v;
  const m = String(v).match(/\[(\d+)\]/);   // <-- \d+ statt \d
  return m ? Number(m[1]) : "";
};

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
    // ✅ Nur loadData ignorieren; Dropdown/Autocomplete etc. zählen als Edit
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
          // neue Zeile → ID vom Backend holen & positionsmap schicken
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

          if (!isBlocked && hotInstance) {
            const posMap = buildVisualPositionMap(sheetName, hotInstance, colHeaders, data);
            if (posMap) sendPositionMap(posMap.sheet, posMap.rows, projectId);
          }
        }

        const colName =
          typeof prop === "number" ? colHeaders[prop] : String(prop);

        // ✅ Einbauort: Label → ID normalisieren (für zuverlässigen Diff)
        let oV: string | number = oldValue as any;
        let nV: string | number = newValue as any;
        if (colName === "Einbauort") {
          const oId = idFromEinbauortLabel(oV);
          const nId = idFromEinbauortLabel(nV);
          if (oId === "" && nId === "") continue; // nichts parsebar
          oV = oId === "" ? "" : String(oId);
          nV = nId === "" ? "" : String(nId);
        }

        addEdit({
          rowId,
          col: prop,
          colName,
          oldValue: oV,
          newValue: nV,
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
