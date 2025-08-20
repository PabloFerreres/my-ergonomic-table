import { addEdit, getUnsavedEdits } from "../editierung/EditMap";
import { sendEdits, sendPositionMap, fetchNextInsertedId } from "../utils/apiSync";
import { buildVisualPositionMap } from "../utils/BuildVisualPositionMap";
import type Handsontable from "handsontable";
import type { CellChange, ChangeSource } from "handsontable/common";

// ✅ FIX: beliebig viele Ziffern aus "[123]" ziehen (Normalisierung beibehalten)
const idFromEinbauortLabel = (v: unknown): number | "" => {
  if (v == null || v === "") return "";
  if (typeof v === "number") return v;
  const m = String(v).match(/\[(\d+)\]/);   // \d+ = beliebig viele Ziffern
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
    // ✅ Nur loadData ignorieren; alles andere (auch Undo/Redo) wird gesendet
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
          // Neue Zeile → ID vom Backend holen & PositionMap schicken
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

        const colName = typeof prop === "number" ? colHeaders[prop] : String(prop);

        // 🔒 Sicherheit: direkte Änderung an der ID-Spalte nicht senden
        if (colName === "project_article_id") continue;

        // ✅ Normalisierung behalten: Einbauort-Label → ID herausziehen
        let oV: string | number = oldValue as any;
        let nV: string | number = newValue as any;
        if (colName === "Einbauort") {
          const oId = idFromEinbauortLabel(oV);
          const nId = idFromEinbauortLabel(nV);
          if (oId === "" && nId === "") continue; // nichts parsebar → nichts senden
          oV = oId === "" ? "" : String(oId);
          nV = nId === "" ? "" : String(nId);
        }

        // 🚫 KEINE "Original"-Logik mehr:
        // Wir legen immer einen Edit an, sobald oldValue !== newValue
        // (Nach der optionalen Normalisierung oben.)
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
