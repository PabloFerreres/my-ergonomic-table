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

  const colIndex = headers.indexOf("project_article_id");
  if (colIndex === -1) {
    console.warn("Column 'project_article_id' not found", sheetName);
    return null;
  }

  console.log("buildVisualPositionMap", {
    sheetName,
    hotInstance,
    headers,
    dataLength: data.length,
  });

  const rows = [];

  for (let visualRow = 0; visualRow < hotInstance.countRows(); visualRow++) {
    const physicalRow = hotInstance.toPhysicalRow(visualRow);
    const row = data[physicalRow];
    if (!row) continue;

    const id = row[colIndex];
    if (id === undefined || id === null) continue;

    rows.push({
      rowId: id,
      project_article_id: id,
      position: visualRow + 1,
    });
  }

  return { sheet: sheetName, rows };
}
