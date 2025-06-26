import type Handsontable from "handsontable";
import {  deleteRow } from "../editierung/EditMap";

export const useHandsontableRowHooks = (
  sheetName: string,
  data: (string | number)[][],
  colHeaders: string[]
) => {
  const rowIdIndex = colHeaders.indexOf("project_article_id");

  const registerRowHooks = (instance: Handsontable) => {
    instance.addHook("afterCreateRow", (index, amount, source?: string) => {
      if (source === "ContextMenu") {
        for (let i = 0; i < amount; i++) {
          const position = (index + i + 1) * 1000;
          const emptyRow = new Array(colHeaders.length).fill("");
          addRow(sheetName, position, emptyRow);
        }
      }
    });

    instance.addHook("afterRemoveRow", (_, __, rows: number[], source?: string) => {
      if (source === "ContextMenu") {
        for (const row of rows) {
          const rowId = data[row]?.[rowIdIndex];
          if (rowId !== undefined) {
            deleteRow(sheetName, rowId);
          }
        }
      }
    });
  };

  return { registerRowHooks };
};
