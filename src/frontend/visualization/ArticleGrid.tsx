import React, { useMemo } from "react";
import { HotTable } from "@handsontable/react";
import "handsontable/dist/handsontable.full.min.css";
import { registerAllModules } from "handsontable/registry";
import Handsontable from "handsontable";
import ColumnStyleMap from "./Formating/ColumnStyleMap.json";
registerAllModules();

interface ArticleGridProps {
  data: (string | number)[][];
  colHeaders: string[];
}

const MAX_COL_WIDTH = 70;
const MIN_COL_WIDTH = 30;
const SPECIAL_MAX_COL_WIDTH = 400; // For special columns
const SPECIAL_COLUMNS = ["beschreibung", "bestellbezeichnung"];
const ROW_HEIGHT = 25; // 1 line only

function getColumnWidths(data: (string | number)[][], colHeaders: string[]) {
  return colHeaders.map((header, colIdx) => {
    const maxLen = Math.max(
      header.length,
      ...data.map((row) => row[colIdx]?.toString().length || 0)
    );
    const isSpecial = SPECIAL_COLUMNS.includes(header.toLowerCase());
    const maxWidth = isSpecial ? SPECIAL_MAX_COL_WIDTH : MAX_COL_WIDTH;
    return Math.max(MIN_COL_WIDTH, Math.min(maxWidth, maxLen * 8));
  });
}

// Custom renderer for striped rows
function stripedRenderer(
  instance: unknown,
  td: HTMLTableCellElement,
  row: number,
  col: number,
  prop: string | number,
  value: unknown,
  cellProperties: Handsontable.CellProperties
) {
  Handsontable.renderers.TextRenderer(
    instance as Handsontable,
    td,
    row,
    col,
    prop,
    value,
    cellProperties
  );
  td.style.backgroundColor = row % 2 === 1 ? "#f5f5f5" : "";
  td.style.color = "#222";
  td.style.borderColor = "#bbb";
}

// Move headerToColorClass outside the component to avoid React hook warning
const headerToColorClass: Record<string, string> = {};
Object.entries(ColumnStyleMap).forEach(([className, obj]) => {
  if (obj.headers) {
    obj.headers.forEach((header: string) => {
      headerToColorClass[header] = className;
    });
  }
});

const ArticleGrid: React.FC<ArticleGridProps> = ({ data, colHeaders }) => {
  const colWidths = useMemo(
    () => getColumnWidths(data, colHeaders),
    [data, colHeaders]
  );

  // Build column definitions with color classes
  const columns = useMemo(() => {
    return colHeaders.map((header) => {
      return {
        renderer: stripedRenderer,
        className: '', // No color class for data cells
        headerClassName: headerToColorClass[header] || '', // Use color class for header only
      };
    });
  }, [colHeaders]);

  // Add header color styling
  const headerColorStyles = Object.entries(ColumnStyleMap)
    .map(([className, obj]) =>
      obj.color
        ? `.article-grid .${className} { background-color: ${obj.color} !important; }`
        : ""
    )
    .join("\n");

  return (
    <div style={{ height: "100%", width: "calc(100%)" }}>
      <HotTable
        data={data}
        colHeaders={colHeaders}
        colWidths={colWidths}
        rowHeights={ROW_HEIGHT}
        rowHeaders={true}
        width="100%"
        height="100%"
        stretchH="all"
        licenseKey="non-commercial-and-evaluation"
        readOnly={true}
        autoWrapRow={false}
        autoWrapCol={false}
        manualColumnResize={false}
        manualRowResize={false}
        wordWrap={false}
        renderAllColumns={false}
        renderAllRows={false}
        fixedColumnsLeft={1}
        columnSorting={true}
        filters={true}
        dropdownMenu={true}
        className="article-grid"
        columns={columns}
      />
      <style>{`
        .article-grid .htCore th {
          color: #222 !important;
          font-weight: bold !important;
        }
        .article-grid .htCore td, .article-grid .htCore th {
          border-color: #bbb !important;
        }
        ${headerColorStyles}
      `}</style>
    </div>
  );
};

export default ArticleGrid;
