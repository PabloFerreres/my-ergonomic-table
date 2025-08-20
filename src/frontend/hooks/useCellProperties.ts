import type Handsontable from "handsontable";
import { getUnsavedEdits } from "../editierung/EditMap";
import type { EditEntry } from "../editierung/EditMap";

export function useCellProperties(
  data: (string | number)[][],
  rowIdIndex: number,
  sheetName: string
) {
  return (row: number, col: number): Handsontable.CellProperties => {
    const cellProperties = {} as Handsontable.CellProperties;

    const rowData = data[row];
    if (!rowData || rowData[rowIdIndex] === undefined) return cellProperties;

    const rowId = rowData[rowIdIndex];
    const unsaved = getUnsavedEdits(sheetName);
    const isEdited = unsaved.some(
      (e: EditEntry) => e.rowId === rowId && e.col === col
    );

    // ✅ Baue Klassen sauber zusammen
    const classes: string[] = [];

    if (typeof rowId === "number" && rowId < 0) {
      classes.push("row-new");
    }

    if (isEdited) {
      classes.push("unsaved-edit");
    }

    if (classes.length > 0) {
      cellProperties.className = classes.join(" ");
    }

    return cellProperties;
  };
}
