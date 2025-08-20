import { HotTable, HotTableClass } from "@handsontable/react";
import "handsontable/dist/handsontable.full.min.css";
import { registerAllModules } from "handsontable/registry";
registerAllModules();

import "./TableGrid.css";
import {
  afterGetColHeader,
  handleAfterFilter,
} from "./uiTableGrid/TableGridConsts";
import { useDropdownColumns, useDropdownOptions } from "../hooks/useDropdowns";
import { useCellProperties } from "../hooks/useCellProperties";
import { useAfterChange } from "../hooks/useAfterChange";
import { useAfterRowMove } from "../hooks/useAfterRowMove";
import { useAfterUndo } from "../hooks/useAfterUndo";
import Handsontable from "handsontable";
import { buildVisualPositionMap } from "../utils/BuildVisualPositionMap";
import { sendPositionMap } from "../utils/apiSync";
import { uiConsole } from "../utils/uiConsole";
import type { Project } from "./SesionParameters";
import { computeHotStatus } from "./uiTableGrid/hotStatus";

import config from "../../../config.json";
const API_PREFIX = config.BACKEND_URL;

interface TableGridProps {
  data: (string | number)[][];
  colHeaders: string[];
  colWidths?: (number | undefined)[];
  rowHeights?: number | number[];
  hotRef?: React.RefObject<HotTableClass | null>;
  afterFilter?: (isActive: boolean) => void;
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
  afterFilter,
  sheetName,
  isBlocked = false,
  onSelectionChange,
  selectedProject,
  onStatusChange,
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

  const getCellProps = (row: number, col: number) => {
    const base = baseCellProps(row, col);

    // Header-Zeilen komplett sperren
    if (isHeaderRow(row)) {
      return {
        ...base,
        readOnly: true,
        editor: false,
        className:
          (base.className ? base.className + " " : "") + "het-header-row",
      };
    }

    if (isRowEntfallen(safeData, row, kommentarIdx)) {
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

  const handleSelection = (row: number, col: number) => {
    // Header: keine Selektion zulassen (verhindert Moves/Edits)
    if (isHeaderRow(row)) {
      const hot = hotRef?.current?.hotInstance;
      hot?.deselectCell();
      return;
    }
    onSelectionChange?.({ row, col });
  };

  // NEU: einheitlich Status emittieren
  const emitStatus = () => {
    const hot = hotRef?.current?.hotInstance ?? null;
    const s = computeHotStatus(hot);
    onStatusChange?.(s);
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
          if (!changes) return; // (changes: (CellChange|null)[])
          for (let i = changes.length - 1; i >= 0; i--) {
            const change = changes[i];
            if (!change) continue;
            const row = change[0] as number; // [row, prop, old, new]
            if (isHeaderRow(row)) changes.splice(i, 1);
          }
        }}
        // Kein Paste in Header
        beforePaste={(_data, coords) => {
          const r0 = coords?.[0]?.startRow;
          if (r0 != null && isHeaderRow(r0)) return false;
        }}
        afterGetColHeader={(col, TH) => afterGetColHeader(col, TH, colHeaders)}
        afterFilter={() => {
          const hot = hotRef?.current?.hotInstance ?? null;
          if (!hot) return;

          // bestehende Utility-Logik nutzen
          handleAfterFilter(hot, colHeaders, afterFilter);

          // 🔒 Menü schließen mit Delay
          setTimeout(() => {
            const dm: any = hot.getPlugin("dropdownMenu");
            if (dm?.close) dm.close();
            else if (dm?.menu?.close) dm.menu.close();
          }, 0);

          // Status nachziehen
          Promise.resolve().then(() => emitStatus());
        }}
        afterDropdownMenuHide={() => {
          emitStatus();
        }}
        afterColumnSort={() => {
          emitStatus(); // sofortiger Sort-Status
        }}
        afterInit={() => {
          emitStatus(); // initialer Status
        }}
        afterLoadData={() => {
          emitStatus(); // Status nach Datenwechsel
        }}
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
                selected.forEach(([startRow, , endRow]) => {
                  const from = Math.min(startRow, endRow);
                  const to = Math.max(startRow, endRow);
                  for (let r = from; r <= to; r++) rows.add(r);
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
            clear_column: {},
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
