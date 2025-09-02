import { addEdit, getUnsavedEdits, removeEdit } from "../editierung/EditMap";
import { sendEdits, sendPositionMap, fetchNextInsertedId } from "../utils/apiSync";
import { buildVisualPositionMap } from "../utils/BuildVisualPositionMap";
import type Handsontable from "handsontable";
import type { CellChange, ChangeSource } from "handsontable/common";
import { uiConsole } from "../utils/uiConsole";

// ✅ beliebig viele Ziffern aus "[123]" ziehen (Normalisierung beibehalten)
const idFromEinbauortLabel = (v: unknown): number | "" => {
  if (v == null || v === "") return "";
  if (typeof v === "number") return v;
  const m = String(v).match(/\[(\d+)\]/);
  return m ? Number(m[1]) : "";
};

// vermeidet TS2367 (ChangeSource enthält "revert" nicht)
const isRevertSource = (s: unknown): boolean => s === "revert";

// strikte, aber einfache Zellwert-Typen
type CellVal = string | number | boolean | Date | null | undefined;
const toStrNum = (v: CellVal): string | number => {
  if (v == null) return "";
  return typeof v === "number" ? v : String(v);
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
    // ⛔️ Reverts ignorieren, um keinen Loop zu erzeugen
    if (!changes || source === "loadData" || isRevertSource(source)) return;

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

        // 🔒 direkte Änderung an der ID-Spalte nicht senden
        if (colName === "project_article_id") continue;

        // Werte typfest normalisieren (kein any)
        let oV: string | number = toStrNum(oldValue as CellVal);
        let nV: string | number = toStrNum(newValue as CellVal);

        // ✅ Einbauort-Label → ID herausziehen
        if (colName === "Einbauort") {
          const oId = idFromEinbauortLabel(oldValue);
          const nId = idFromEinbauortLabel(newValue);
          if (oId === "" && nId === "") continue; // nichts parsebar → nichts senden
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

    if (!changed) return;

    const unsaved = getUnsavedEdits(sheetName);
    if (unsaved.length === 0) return;

    // für Revert bei Fehler den zuletzt erfassten Edit merken
    const bad = unsaved[unsaved.length - 1];

    try {
      await sendEdits(sheetName, unsaved, projectId);
      // Erfolg: dein bestehender Flow räumt den Stack bereits auf
    } catch (err) {
  if (bad && hotInstance) {
    const colIndex =
      typeof bad.col === "number" ? (bad.col as number)
      : colHeaders.indexOf(bad.colName ?? String(bad.col));

    if (colIndex >= 0) {
      const physRow = data.findIndex(
        (r) => String(r[rowIdIndex]) === String(bad.rowId)
      );
      if (physRow >= 0) {
        const vRow = hotInstance.toVisualRow(physRow);
        hotInstance.setDataAtCell(vRow, colIndex, bad.oldValue, "revert");
      }
    }
    removeEdit(sheetName, bad.rowId, bad.col);
  }

  // 🔎 Klarer Konsolen-Eintrag für den "Error Edit"
  const info = {
    sheet: sheetName,
    rowId: bad?.rowId,
    col: bad?.colName ?? String(bad?.col),
    oldValue: bad?.oldValue,
    attemptedValue: bad?.newValue,
    reason: err instanceof Error ? err.message : String(err),
  };
  console.groupCollapsed("🛑 Error Edit reverted & removed");
  console.log(info);
  console.groupEnd();

  uiConsole(`❌ Error-Edit verworfen: ${info.col} @ pa.id ${info.rowId}`);
  }

  };
}
