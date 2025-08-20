import config from "../../../../config.json";
const API_PREFIX = config.BACKEND_URL;

// Preset für Header-Zeilen (px)
const HEADER_ROW_HEIGHT = 32; // anpassen, z.B. 28/36

export async function triggerLayoutCalculation(
  headers: string[],
  data: (string | number)[][],
  onSuccess: (result: {
    columnWidths: Record<string, number>;
    rowHeights: Record<number, number>;
  }) => void
) {
  try {
    const idxKommentar = headers.indexOf("Kommentar");

    // Merken, welche Originalzeilen Header sind (Kommentar === "HEADER")
    const isHeaderRow: boolean[] =
      idxKommentar === -1
        ? data.map(() => false)
        : data.map((row) => String(row?.[idxKommentar] ?? "") === "HEADER");

    // Für den Request: Header-Zeilen rausfiltern (verhindert 422)
    const filteredData =
      idxKommentar === -1 ? data : data.filter((_, i) => !isHeaderRow[i]);

    const res = await fetch(`${API_PREFIX}/api/layout/estimate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ headers, data: filteredData }),
    });

    const result = await res.json();
    console.log("📊 Layout estimation result:", result);

    // Reihenfolge für rowHeights wieder auf volle Länge bringen:
    // - Header-Zeilen: Preset-Höhe
    // - Nicht-Header: Werte in Reihenfolge aus result.rowHeights (0..n-1)
    const compactHeights: Record<string | number, number> =
      result?.rowHeights ?? {};

    const expanded: Record<number, number> = {};
    let compactIdx = 0;

    for (let i = 0; i < data.length; i++) {
      if (isHeaderRow[i]) {
        expanded[i] = HEADER_ROW_HEIGHT;
      } else {
        const h =
          compactHeights[compactIdx] ??
          compactHeights[String(compactIdx)] ??
          undefined;
        if (typeof h === "number") {
          expanded[i] = h;
        }
        compactIdx += 1;
      }
    }

    onSuccess({
      columnWidths: result?.columnWidths ?? {},
      rowHeights: expanded,
    });
  } catch (err) {
    console.error("❌ Failed to trigger layout calculation:", err);
    // Fallback: neutrale Defaults
    onSuccess({ columnWidths: {}, rowHeights: {} });
  }
}
