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
import Handsontable from "handsontable";
import { buildVisualPositionMap } from "../utils/BuildVisualPositionMap";
import { sendPositionMap } from "../utils/apiSync";

interface TableGridProps {
  data: (string | number)[][];
  colHeaders: string[];
  colWidths?: (number | undefined)[];
  rowHeights?: number | number[];
  hotRef?: React.RefObject<HotTableClass | null>;
  afterSelection?: (
    row: number,
    col: number,
    row2: number,
    col2: number
  ) => void;
  afterFilter?: (isActive: boolean) => void;
  sheetName: string;
  isBlocked?: boolean;
}

function TableGrid({
  data,
  colHeaders,
  colWidths,
  rowHeights,
  hotRef,
  afterSelection,
  afterFilter,
  sheetName,
  isBlocked = false, // default: false
}: TableGridProps) {
  const columnDefs = colHeaders.map((header) => ({
    readOnly: header === "project_article_id",
  }));
  const rowIdIndex = colHeaders.indexOf("project_article_id");

  const getCellProps = useCellProperties(data, rowIdIndex, sheetName);
  const onChange = useAfterChange(
    data,
    rowIdIndex,
    colHeaders,
    sheetName,
    hotRef?.current?.hotInstance ?? null,
    isBlocked
  );
  const onRowMove = useAfterRowMove(
    data,
    rowIdIndex,
    sheetName,
    hotRef?.current?.hotInstance ?? null, // ✅ hot
    colHeaders // ✅ headers
  );

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
        afterSelection={afterSelection}
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
