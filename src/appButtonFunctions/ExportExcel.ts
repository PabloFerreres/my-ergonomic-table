import type { MutableRefObject, RefObject } from "react";
import type { HotTableClass } from "@handsontable/react";

export type ExportExcelArgs = {
  apiPrefix: string;
  projectId: number;
  sheetName: string;
  hotRefs: MutableRefObject<Record<string, RefObject<HotTableClass>>>;
};

export async function exportExcel({
  apiPrefix,
  projectId,
  sheetName,
  hotRefs,
}: ExportExcelArgs) {
  const hot = hotRefs.current[sheetName]?.current?.hotInstance;
  if (!hot) throw new Error("Hot instance not found");

  const headers = (hot.getColHeader() as string[]).map(String);
  const data = hot.getData();

  const columnWidths: Record<string, number> = {};
  headers.forEach((h, i) => {
    const w = typeof hot.getColWidth === "function" ? hot.getColWidth(i) : undefined;
    if (typeof w === "number" && w > 0) columnWidths[h] = w;
  });

  const rowHeights: Record<number, number> = {};
  const rc = hot.countRows();
  for (let r = 0; r < rc; r++) {
    const hh = typeof hot.getRowHeight === "function" ? hot.getRowHeight(r) : undefined;
    if (typeof hh === "number" && hh > 0) rowHeights[r] = hh;
  }

  const payload = {
    filename: `Projekt_${projectId}_${sheetName}.xlsx`,
    sheets: [{ name: sheetName, headers, data, layout: { columnWidths, rowHeights } }],
  };

  const res = await fetch(`${apiPrefix}/api/export/excel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Export failed ${res.status}`);

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = payload.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
