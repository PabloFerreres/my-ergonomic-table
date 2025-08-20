import { HotTable, HotTableClass } from "@handsontable/react";
import Handsontable from "handsontable";
import "handsontable/dist/handsontable.full.min.css";
import { registerAllModules } from "handsontable/registry";
registerAllModules();

import "./TableGrid.css";
import { afterGetColHeader } from "./uiTableGrid/TableGridConsts";
import { useDropdownColumns, useDropdownOptions } from "../hooks/useDropdowns";
import { useCellProperties } from "../hooks/useCellProperties";
import { useAfterChange } from "../hooks/useAfterChange";
import { useAfterRowMove } from "../hooks/useAfterRowMove";
import { useAfterUndo } from "../hooks/useAfterUndo";
import { buildVisualPositionMap } from "../utils/BuildVisualPositionMap";
import { sendPositionMap } from "../utils/apiSync";
import { uiConsole } from "../utils/uiConsole";
import type { Project } from "./SesionParameters";

import config from "../../../config.json";
const API_PREFIX = config.BACKEND_URL;

interface TableGridProps {
  data: (string | number)[][];
  colHeaders: string[];
  colWidths?: (number | undefined)[];
  rowHeights?: number | number[];
  hotRef?: React.RefObject<HotTableClass | null>;
  sheetName: string;
  isBlocked?: boolean;
  onSelectionChange?: (cell: { row: number; col: number }) => void;
  selectedProject: Project;
  /** NEU: sofortiger Status-Callback für Filter/Sort */
  onStatusChange?: (s: { isFiltered: boolean; isSorted: boolean }) => void;
}

// Hilfsfunktion: Ist Kommentar-Spalte vorhanden & enthält sie "entfallen"?
function isRowEntfallen(
  data: (string | number)[][],
  rowIdx: number,
  kommentarIdx: number
) {
  if (kommentarIdx === -1) return false;
  const val = String(data[rowIdx]?.[kommentarIdx] ?? "").toLowerCase();
  return val.includes("entfallen");
}

function TableGrid({
  data,
  colHeaders,
  colWidths,
  rowHeights,
  hotRef,
  sheetName,
  isBlocked = false,
  onSelectionChange,
  selectedProject,
}: TableGridProps) {
  // Workaround: Wenn data leer, aber colHeaders da → Dummy-Zeile anzeigen
  const safeData =
    Array.isArray(data) && data.length === 0 && colHeaders.length > 0
      ? [colHeaders.map(() => "")]
      : data;

  const rowIdIndex = colHeaders.indexOf("project_article_id");
  const kommentarIdx = colHeaders.indexOf("Kommentar");

  // Header-Erkennung: Kommentar === "HEADER"
  const isHeaderRow = (rowIdx: number) =>
    kommentarIdx !== -1 &&
    String(safeData[rowIdx]?.[kommentarIdx] ?? "") === "HEADER";

  // Prüfen, ob aktuelle Auswahl mindestens eine Header-Zeile enthält
  const selectionHasHeader = () => {
    const hot = hotRef?.current?.hotInstance;
    if (!hot) return false;
    const sel = hot.getSelected();
    if (!sel) return false;
    for (const [r1, , r2] of sel) {
      const from = Math.min(r1, r2);
      const to = Math.max(r1, r2);
      for (let r = from; r <= to; r++) {
        if (isHeaderRow(r)) return true;
      }
    }
    return false;
  };

  // Dropdown-Inhalte laden (aus /api/dropdownOptions) und Columns damit anreichern
  const { dropdowns /*, loading, error, reload*/ } = useDropdownOptions(
    selectedProject.id,
    colHeaders
  );
  const columnDefsRaw = useDropdownColumns(colHeaders, dropdowns);
  console.debug(
    "HOT columns",
    columnDefsRaw.map((c) => c.type)
  );

  const baseCellProps = useCellProperties(safeData, rowIdIndex, sheetName);

  const getCellProps = (visualRow: number, visualCol: number) => {
    const hot = hotRef?.current?.hotInstance;
    const physRow = hot?.toPhysicalRow?.(visualRow) ?? visualRow;
    const base = baseCellProps(physRow, visualCol);

    if (isHeaderRow(physRow)) {
      return {
        ...base,
        readOnly: true,
        editor: false,
        className:
          (base.className ? base.className + " " : "") + "het-header-row",
      };
    }

    if (isRowEntfallen(safeData, physRow, kommentarIdx)) {
      return {
        ...base,
        className:
          (base.className ? base.className + " " : "") + "row-entfallen",
      };
    }

    return base;
  };

  const columnDefs = columnDefsRaw.map((def, index) => {
    const header = colHeaders[index];
    return {
      ...def,
      readOnly: header === "project_article_id" ? true : def.readOnly,
    };
  });

  const onChange = useAfterChange(
    safeData,
    rowIdIndex,
    colHeaders,
    sheetName,
    hotRef?.current?.hotInstance ?? null,
    isBlocked,
    selectedProject.id
  );

  useAfterUndo(
    hotRef?.current?.hotInstance ?? null,
    sheetName,
    colHeaders,
    safeData,
    selectedProject.id
  );

  const onRowMove = useAfterRowMove(
    safeData,
    rowIdIndex,
    sheetName,
    hotRef?.current?.hotInstance ?? null,
    colHeaders,
    selectedProject.id
  );

  const handleSelection = (visualRow: number, visualCol: number) => {
    const hot = hotRef?.current?.hotInstance;
    const physRow = hot?.toPhysicalRow?.(visualRow) ?? visualRow;

    if (isHeaderRow(physRow)) {
      hot?.deselectCell();
      return;
    }
    onSelectionChange?.({ row: physRow, col: visualCol });
  };

  return (
    <div style={{ height: "100%" }}>
      <HotTable
        ref={hotRef as React.RefObject<HotTableClass>}
        data={safeData}
        cells={getCellProps}
        rowHeights={rowHeights}
        columns={columnDefs}
        colHeaders={colHeaders.length > 0 ? colHeaders : true}
        colWidths={colWidths}
        rowHeaders={true}
        hiddenColumns={{ indicators: true }}
        autoRowSize={false}
        autoColumnSize={false}
        renderAllColumns={false}
        filters={true}
        dropdownMenu={true}
        width="100%"
        height="100%"
        stretchH="none"
        licenseKey="non-commercial-and-evaluation"
        afterSelection={handleSelection}
        // Typ-sicherer Header-Block: Änderungen an Header-Zeilen verwerfen
        beforeChange={(changes) => {
          const hot = hotRef?.current?.hotInstance;
          if (!changes || !hot) return;

          for (let i = changes.length - 1; i >= 0; i--) {
            const change = changes[i];
            if (!change) continue;
            const visualRow = change[0] as number;
            const physRow = hot.toPhysicalRow?.(visualRow) ?? visualRow;
            if (isHeaderRow(physRow)) changes.splice(i, 1);
          }
        }}
        // Kein Paste in Header
        beforePaste={(_data, coords) => {
          const hot = hotRef?.current?.hotInstance;
          const r0 = coords?.[0]?.startRow;
          const physRow = hot?.toPhysicalRow?.(r0) ?? r0;
          if (physRow != null && isHeaderRow(physRow)) return false;
        }}
        afterGetColHeader={(col, TH) => afterGetColHeader(col, TH, colHeaders)}
        contextMenu={{
          items: {
            row_above: {
              name: "Insert row above",
              disabled: () => isBlocked || selectionHasHeader(),
            },
            row_below: {
              name: "Insert row below",
              disabled: () => isBlocked || selectionHasHeader(),
            },
            insert_5_below: {
              name: "Insert 5 rows below",
              disabled: () => isBlocked || selectionHasHeader(),
              callback: function () {
                const hot = hotRef?.current?.hotInstance;
                if (!hot || selectionHasHeader()) return;

                const selected = hot.getSelectedLast();
                if (!selected) return;

                const row = selected[0];
                hot.alter("insert_row_below", row, 5);
              },
            },
            send_update_articles: {
              name: "Send/Update Articles 📤🐘",
              disabled: () => isBlocked || selectionHasHeader(),
              callback: async function () {
                const hot = hotRef?.current?.hotInstance;
                if (!hot || selectionHasHeader()) return;

                const selected = hot.getSelected();
                if (!selected) return;

                const rows = new Set<number>();
                selected.forEach(([startVisualRow, , endVisualRow]) => {
                  const from = Math.min(startVisualRow, endVisualRow);
                  const to = Math.max(startVisualRow, endVisualRow);
                  for (let visualRow = from; visualRow <= to; visualRow++) {
                    const physRow = hot.toPhysicalRow?.(visualRow) ?? visualRow;
                    rows.add(physRow);
                  }
                });

                const selection = Array.from(rows);

                if (selection.length === 0) {
                  uiConsole("⚠️ Keine Zeilen markiert!");
                  return;
                }

                try {
                  const res = await fetch(
                    `${API_PREFIX}/api/importOrUpdateArticles`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ selection }),
                    }
                  );
                  const result = await res.json();

                  if (result.log && Array.isArray(result.log)) {
                    result.log.forEach((line: string) => uiConsole(line));
                  } else {
                    uiConsole(
                      "⚠️ Keine Änderungen durchgeführt – nichts zu importieren oder updaten!"
                    );
                  }
                } catch (err) {
                  console.error(err);
                  uiConsole(`❌ Fehler beim Import/Update: ${err}`);
                }
              },
            },
            remove_row: {
              name: "Remove row",
              disabled: () => isBlocked || selectionHasHeader(),
            },
            undo: {},
            redo: {},
            alignment: {},
            copy: {},
            cut: {},
            paste: {},
            separator: Handsontable.plugins.ContextMenu.SEPARATOR,
          },
        }}
        columnSorting={true}
        manualRowMove={!isBlocked}
        afterChange={onChange}
        afterRowMove={onRowMove}
        afterRemoveRow={() => {
          if (!isBlocked) {
            const hot = hotRef?.current?.hotInstance;
            if (!hot) return;

            const map = buildVisualPositionMap(
              sheetName,
              hot,
              colHeaders,
              safeData
            );
            if (map) sendPositionMap(map.sheet, map.rows, selectedProject.id);
          }
        }}
      />
    </div>
  );
}

export default TableGrid;
