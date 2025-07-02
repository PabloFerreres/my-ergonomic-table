import { HotTable, HotTableClass } from "@handsontable/react";
import "handsontable/dist/handsontable.full.min.css";
import { registerAllModules } from "handsontable/registry";
registerAllModules();

import "./TableGrid.css";
import {
  buildColumnDefs,
  afterGetColHeader,
  handleAfterFilter,
} from "./uiTableGrid/TableGridConsts";
import { useCellProperties } from "../hooks/useCellProperties";
import { useAfterChange } from "../hooks/useAfterChange";
import { useAfterRowMove } from "../hooks/useAfterRowMove";
import { useAfterUndo } from "../hooks/useAfterUndo";
import Handsontable from "handsontable";
import { buildVisualPositionMap } from "../utils/BuildVisualPositionMap";
import { sendPositionMap } from "../utils/apiSync";
import { uiConsole } from "../utils/uiConsole";

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
}: TableGridProps) {
  const rowIdIndex = colHeaders.indexOf("project_article_id");

  const getCellProps = useCellProperties(data, rowIdIndex, sheetName);

  const columnDefs = buildColumnDefs(colHeaders).map((def, index) => {
    const header = colHeaders[index];
    return {
      ...def,
      readOnly: header === "project_article_id" ? true : def.readOnly,
    };
  });

  const onChange = useAfterChange(
    data,
    rowIdIndex,
    colHeaders,
    sheetName,
    hotRef?.current?.hotInstance ?? null,
    isBlocked
  );

  useAfterUndo(
    hotRef?.current?.hotInstance ?? null,
    sheetName,
    colHeaders,
    data
  );

  const onRowMove = useAfterRowMove(
    data,
    rowIdIndex,
    sheetName,
    hotRef?.current?.hotInstance ?? null,
    colHeaders
  );

  const handleSelection = (row: number, col: number) => {
    onSelectionChange?.({ row, col });
  };

  return (
    <div style={{ height: "100%" }}>
      <HotTable
        ref={hotRef as React.RefObject<HotTableClass>}
        data={data}
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
        afterGetColHeader={(col, TH) => afterGetColHeader(col, TH, colHeaders)}
        afterFilter={() =>
          handleAfterFilter(
            hotRef?.current?.hotInstance ?? null,
            colHeaders,
            afterFilter
          )
        }
        contextMenu={{
          items: {
            row_above: {
              name: "Insert row above",
              disabled: () => isBlocked,
            },
            row_below: {
              name: "Insert row below",
              disabled: () => isBlocked,
            },
            insert_5_below: {
              name: "Insert 5 rows below",
              disabled: () => isBlocked,
              callback: function () {
                const hot = hotRef?.current?.hotInstance;
                if (!hot) return;

                const selected = hot.getSelectedLast();
                if (!selected) return;

                const row = selected[0];
                hot.alter("insert_row_below", row, 5);
              },
            },
            send_update_articles: {
              name: "Send/Update Articles",
              disabled: () => isBlocked,
              callback: async function () {
                const hot = hotRef?.current?.hotInstance;
                if (!hot) return;

                const selected = hot.getSelected();
                if (!selected) return;

                const rows = new Set<number>();
                selected.forEach(([startRow, , endRow]) => {
                  const from = Math.min(startRow, endRow);
                  const to = Math.max(startRow, endRow);
                  for (let r = from; r <= to; r++) rows.add(r);
                });

                const ids: number[] = [];
                rows.forEach((row) => {
                  const projectArticleId = data[row][rowIdIndex];
                  if (typeof projectArticleId === "number") {
                    ids.push(projectArticleId);
                  }
                });

                if (ids.length === 0) {
                  uiConsole("⚠️ Keine gültigen Zeilen markiert!");
                  return;
                }

                try {
                  const res = await fetch(
                    "http://localhost:8000/api/importOrUpdateArticles",
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ ids }),
                    }
                  );
                  const result = await res.json();

                  if (result.log && Array.isArray(result.log)) {
                    result.log.forEach((line: string) => uiConsole(line));
                  } else {
                    uiConsole(
                      "✅ Import/Update fertig, keine weiteren Details."
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
              disabled: () => isBlocked,
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
              data
            );
            if (map) sendPositionMap(map.sheet, map.rows);
          }
        }}
      />
    </div>
  );
}

export default TableGrid;
