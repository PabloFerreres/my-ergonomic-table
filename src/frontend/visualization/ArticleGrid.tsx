import React, { useMemo } from "react";
import { HotTable } from "@handsontable/react";
import "handsontable/dist/handsontable.full.min.css";
import { registerAllModules } from "handsontable/registry";
import Handsontable from "handsontable";
import ColumnStyleMap from "./Formating/ColumnStyleMap.json";
import "./ArticleGrid.custom.css";
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
        className: "", // No color class for data cells
        headerClassName: headerToColorClass[header] || "", // Use color class for header only
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
        dropdownMenu={{
          items: [
            "filter_by_condition",
            "filter_operators",
            "filter_by_value",
            "filter_action_bar",
          ],
        }}
        className="article-grid"
        columns={columns}
        afterGetColHeader={(_col, TH) => {
          // Only change filter button style/position, not the rest
          const button = TH.querySelector(
            "button.changeType"
          ) as HTMLButtonElement;
          if (button) {
            button.style.position = "absolute";
            button.style.right = "1px";
            button.style.bottom = "0px";
            button.style.top = "auto";
            button.style.left = "auto";
            button.style.width = "28px";
            button.style.height = "18px";
            button.style.padding = "2px 4px 2px 2px";
            button.style.margin = "0";
            button.style.fontSize = "11px";
            button.style.fontWeight = "normal";
            button.style.background = "#eaeaea";
            button.style.border = "1px solid #ccc";
            button.style.borderRadius = "6px";
            button.style.zIndex = "9999";
            button.style.pointerEvents = "auto";
            button.style.display = "inline-flex";
            button.style.alignItems = "center";
            button.style.verticalAlign = "middle";
            button.style.opacity = "0.5";
            // On hover, increase opacity
            button.onmouseenter = () => (button.style.opacity = "0.8");
            button.onmouseleave = () => (button.style.opacity = "0.5");
          }
          // Make header double rowed
          const headerLabel = TH.querySelector(".colHeader") as HTMLElement;
          if (headerLabel) {
            headerLabel.style.whiteSpace = "normal";
            headerLabel.style.wordBreak = "break-word";
            headerLabel.style.display = "block";
            headerLabel.style.lineHeight = "1.2";
            headerLabel.style.height = "2.4em"; // always reserve space for 2 lines
            headerLabel.style.maxHeight = "2.4em";
            headerLabel.style.overflow = "hidden";
            // Ensure header background color fills the whole cell
            TH.style.backgroundClip = "padding-box";
            TH.style.backgroundColor = TH.style.backgroundColor || "#f0f0f0";
            TH.style.paddingTop = "0px"; // Remove extra padding
            TH.style.paddingBottom = "0px";
            TH.style.height = "2.4em"; // always fill header cell, exactly 2 lines
            TH.style.minHeight = "2.4em";
          }
        }}
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
