import Handsontable from "handsontable";

export function buildVisualPositionMap(
  sheetName: string,
  hotInstance: Handsontable | null,
  headers: string[],
  data: (string | number)[][]
): {
  sheet: string;
  rows: {
    rowId: string | number;
    project_article_id: string | number;
    position: number;
  }[];
} | null {
  if (!hotInstance) {
    console.warn("Hot instance missing", sheetName);
    return null;
  }

  const colId = headers.indexOf("project_article_id");
  if (colId === -1) {
    console.warn("Column 'project_article_id' not found", sheetName);
    return null;
  }

  // ⬇️ NEU: Kommentar-Index für Header-Erkennung
  const colKommentar = headers.indexOf("Kommentar");

  console.log("buildVisualPositionMap", {
    sheetName,
    dataLength: data.length,
    visualRows: hotInstance.countRows(),
  });

  const rows: {
    rowId: string | number;
    project_article_id: string | number;
    position: number;
  }[] = [];

  for (let visualRow = 0; visualRow < hotInstance.countRows(); visualRow++) {
    const physicalRow = hotInstance.toPhysicalRow(visualRow);
    if (physicalRow == null || physicalRow < 0) continue;

    const row = data[physicalRow];
    if (!row) continue;

    // ⬇️ NEU: Header-Zeilen überspringen (Kommentar === "HEADER")
    if (colKommentar !== -1 && String(row[colKommentar] ?? "") === "HEADER") {
      continue;
    }

    const id = row[colId];
    if (id === undefined || id === null || id === "") continue; // doppelt sicher

    rows.push({
      rowId: id,
      project_article_id: id,
      position: visualRow + 1,
    });
  }

  return { sheet: sheetName, rows };
}
