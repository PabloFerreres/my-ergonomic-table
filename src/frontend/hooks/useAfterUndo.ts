import { buildVisualPositionMap } from "../utils/BuildVisualPositionMap";
import { sendPositionMap } from "../utils/apiSync";
import type Handsontable from "handsontable";

let undoTimer: number | null = null;

export function useAfterUndo(
  hotInstance: Handsontable | null,
  sheetName: string,
  colHeaders: string[],
  data: (string | number)[][],
  projectId: number
) {
  if (!hotInstance) return;

  hotInstance.addHook("afterUndo", (action) => {
    if ((action as { actionType?: string }).actionType === "remove_row") {
      if (undoTimer) clearTimeout(undoTimer);

      undoTimer = setTimeout(() => {
        const posMap = buildVisualPositionMap(sheetName, hotInstance, colHeaders, data);
        if (posMap) {
          sendPositionMap(posMap.sheet, posMap.rows, projectId);
          console.log("✅ afterUndo → remove_row → PositionMap gesendet");
        }
      }, 50); // 50ms Verzögerung: nur 1x
    }
  });
}
