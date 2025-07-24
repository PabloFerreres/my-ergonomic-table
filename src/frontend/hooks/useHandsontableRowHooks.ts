import type Handsontable from "handsontable";
import {  deleteRow } from "../editierung/EditMap";

export const useHandsontableRowHooks = (
  sheetName: string,
  data: (string | number)[][],
  colHeaders: string[]
) => {
  const rowIdIndex = colHeaders.indexOf("project_article_id");

  const registerRowHooks = (instance: Handsontable) => {
    
    instance.addHook("afterRemoveRow", (_, __, rows?: number[], source?: string) => {
      if (source === "ContextMenu" && rows) {
        for (const row of rows) {
          const rowId = data[row]?.[rowIdIndex];
          if (rowId !== undefined && rowId !== "") {
            deleteRow(sheetName, rowId);
          }
        }
      }
    });
  };

  return { registerRowHooks };
};
