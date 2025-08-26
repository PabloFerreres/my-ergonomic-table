// src/frontend/utils/sse.ts
import type React from "react";
import type { HotTableClass } from "@handsontable/react";
import { softAktualisierenSheets } from "../../appButtonFunctions/SoftAktualisierenSheets";

type Layout = {
  columnWidths: Record<string, number>;
  rowHeights: Record<number, number>;
};

type SheetData = {
  headers: string[];
  data: (string | number)[][];
  layout: Layout;
};

type TriggerLayoutCalculation = (
  headers: string[],
  data: (string | number)[][],
  onSuccess: (result: Layout) => void
) => void | Promise<void>;

type SheetsRefMap = Record<string, React.RefObject<HotTableClass>>;

type Params = {
  projectId: number;
  apiPrefix: string;
  sheetNames: string[];
  triggerLayoutCalculation: TriggerLayoutCalculation;
  setSheets: React.Dispatch<React.SetStateAction<Record<string, SheetData>>>;
  hotRefs: React.MutableRefObject<SheetsRefMap>;
  clearEdits: () => void;
};

type RematEvent = {
  type: "remat_done";
  project_id: number;
  scope: "sheet" | "elektrik" | "all" | "sheet+elektrik";
  sheet?: string;
};

export function initSSERefresh(p: Params) {
  const es = new EventSource(`${p.apiPrefix}/api/sse?project_id=${p.projectId}`);

  let inflight = false;
  let refreshTimer: number | null = null;
  let closed = false;

  const doRefresh = () => {
    if (inflight || closed) return;
    inflight = true;
    Promise.resolve(
      softAktualisierenSheets({
        sheetNames: p.sheetNames,
        apiPrefix: p.apiPrefix,
        projectId: p.projectId,
        triggerLayoutCalculation: p.triggerLayoutCalculation,
        setSheets: p.setSheets,
        hotRefs: p.hotRefs,
        clearEdits: p.clearEdits,
      })
    ).finally(() => {
      inflight = false;
    });
  };

  // Coalesce mehrere Events in kurzem Fenster zu genau 1 Refresh
  const triggerRefresh = () => {
    if (closed) return;
    if (refreshTimer !== null) {
      window.clearTimeout(refreshTimer);
    }
    refreshTimer = window.setTimeout(() => {
      refreshTimer = null;
      doRefresh();
    }, 250);
  };

  es.addEventListener("message", (ev: MessageEvent<string>) => {
    try {
      const data = JSON.parse(ev.data) as RematEvent | unknown;
      if (
        typeof data === "object" &&
        data !== null &&
        (data as RematEvent).type === "remat_done" &&
        (data as RematEvent).project_id === p.projectId
      ) {
        triggerRefresh();
      }
    } catch {
      // ignore malformed payloads
    }
  });

  es.addEventListener("ping", () => {
    return undefined; // keep-alive; nichts zu tun
  });

  es.addEventListener("error", () => {
    // optional: logging / backoff; EventSource reconnectt automatisch
    return undefined;
  });

  return () => {
    closed = true;
    if (refreshTimer !== null) {
      window.clearTimeout(refreshTimer);
      refreshTimer = null;
    }
    es.close();
  };
}
