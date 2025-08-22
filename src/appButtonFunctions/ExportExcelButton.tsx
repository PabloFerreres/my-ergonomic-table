import React, { useCallback } from "react";
import type { MutableRefObject, RefObject } from "react";
import type { HotTableClass } from "@handsontable/react";
import { exportExcel } from "./ExportExcel";

type Props = {
  apiPrefix: string;
  projectId: number;
  activeSheet: string;
  hotRefs: MutableRefObject<Record<string, RefObject<HotTableClass>>>;
};

export default function ExportExcelButton({
  apiPrefix,
  projectId,
  activeSheet,
  hotRefs,
}: Props) {
  const onClick = useCallback(() => {
    exportExcel({
      apiPrefix,
      projectId,
      sheetName: activeSheet,
      hotRefs,
    }).catch((e) => {
      console.error("Export failed", e);
      alert("Export failed");
    });
  }, [apiPrefix, projectId, activeSheet, hotRefs]);

  return (
    <button type="button" onClick={onClick} style={{ padding: "6px 10px" }}>
      Export Excel
    </button>
  );
}
