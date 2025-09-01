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
    project_article_id: string | number | null; // null = Platzhalter/leer
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

  // Fallback für Header-Erkennung
  const colKommentar = headers.indexOf("Kommentar");

  console.log("buildVisualPositionMap", {
    sheetName,
    dataLength: data.length,
    visualRows: hotInstance.countRows(),
  });

  const rows: {
    rowId: string | number;
    project_article_id: string | number | null;
    position: number;
  }[] = [];

  for (let visualRow = 0; visualRow < hotInstance.countRows(); visualRow++) {
    const physicalRow = hotInstance.toPhysicalRow(visualRow);
    if (physicalRow == null || physicalRow < 0) continue;

    const row = data[physicalRow];
    if (!row) continue;

    // Header raus: 1) Renderer-Flag  2) Fallback Kommentar === "HEADER"
    const meta0: any = hotInstance.getCellMeta(physicalRow, 0);
    const isHeaderByMeta = !!meta0?._hetRowState?.isHeader;
    const isHeaderByComment =
      colKommentar !== -1 && String(row[colKommentar] ?? "") === "HEADER";
    if (isHeaderByMeta || isHeaderByComment) continue;

    const rawId = row[colId];
    const projectId =
      rawId === undefined || rawId === null || rawId === ""
        ? null
        : (rawId as string | number);

    rows.push({
      rowId: projectId ?? "",
      project_article_id: projectId,
      position: visualRow + 1, // beibehalten: 1-based Position
    });
  }

  return { sheet: sheetName, rows };
}
