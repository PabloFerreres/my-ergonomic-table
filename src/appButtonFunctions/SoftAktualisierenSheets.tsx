import type { HotTableClass } from "@handsontable/react";
import type {
  MutableRefObject,
  RefObject,
  Dispatch,
  SetStateAction,
} from "react";

type SheetData = {
  headers: string[];
  data: (string | number)[][];
  layout: {
    columnWidths: Record<string, number>;
    rowHeights: Record<number, number>;
  };
};

type Params = {
  sheetNames: string[];
  apiPrefix: string;
  projectId: number;
  triggerLayoutCalculation: (
    headers: string[],
    data: (string | number)[][],
    cb: (layout: SheetData["layout"]) => void
  ) => void;
  setSheets: Dispatch<SetStateAction<Record<string, SheetData>>>;
  hotRefs: MutableRefObject<Record<string, RefObject<HotTableClass>>>;
  clearEdits: () => void;
};

// in-flight Requests steuern
let inFlight: AbortController | null = null;

export async function softAktualisierenSheets({
  sheetNames,
  apiPrefix,
  projectId,
  triggerLayoutCalculation,
  setSheets,
  hotRefs,
  clearEdits,
}: Params) {
  console.time("softAktualisierenSheets");

  // vorherige Läufe abbrechen (kein leerer catch nötig)
  inFlight?.abort();
  inFlight = new AbortController();

  // 0) manualRowMove-Mapping neutralisieren
  sheetNames.forEach((name) => {
    const hot = hotRefs.current[name]?.current?.hotInstance;
    if (!hot) return;

    try {
      hot.suspendRender?.();

      const rc = hot.countRows();
      if (rc > 0) {
        const seq = Array.from({ length: rc }, (_, i) => i);
        hot.rowIndexMapper?.setIndexesSequence?.(seq);
      }
    } finally {
      hot?.resumeRender?.();
    }

    // optional: Undo-Stack leeren
    hot.getPlugin("undoRedo")?.clear?.();
  });

  const t = Date.now(); // Cache-Buster

  type Loaded = {
    name: string;
    headers: string[];
    data: (string | number)[][];
    layout: SheetData["layout"];
  };

  try {
    const results: Loaded[] = await Promise.all(
      sheetNames.map(async (name) => {
        const url =
          `${apiPrefix}/api/tabledata?table=${encodeURIComponent(name)}` +
          `&limit=700&project_id=${projectId}&_=${t}`;
        const res = await fetch(url, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
          signal: inFlight!.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${name}`);
        const { headers, data } = await res.json();
        return new Promise<Loaded>((resolve) =>
          triggerLayoutCalculation(headers, data, (layout) =>
            resolve({ name, headers, data, layout })
          )
        );
      })
    );

    const loaded: Record<string, SheetData> = {};
    results.forEach(({ name, headers, data, layout }) => {
      loaded[name] = { headers, data, layout };
    });

    setSheets(loaded);
    clearEdits();
  } catch (err: unknown) {
    // eslint: no-explicit-any -> unknown + Narrowing
    if ((err as { name?: string }).name === "AbortError") {
      console.info("softAktualisierenSheets: aborted");
      return;
    }
    console.error("softAktualisierenSheets error:", err);
    throw err;
  } finally {
    inFlight = null;
    console.timeEnd("softAktualisierenSheets");
  }
}
