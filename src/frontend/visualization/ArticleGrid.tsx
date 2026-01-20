import React, { useMemo, useImperativeHandle, useRef, forwardRef, useState } from "react";
import { HotTable, HotTableClass } from "@handsontable/react";
import "handsontable/dist/handsontable.full.min.css";
import { registerAllModules } from "handsontable/registry";
import Handsontable from "handsontable";
import ColumnStyleMap from "./Formating/ColumnStyleMap.json";
import "./ArticleGrid.custom.css";
import { computeHotStatus } from "./uiTableGrid/hotStatus";
registerAllModules();

export interface ArticleGridHandle {
  applyQuickFilter: (col: number, query: string, exact: boolean) => void;
  clearQuickFilter: (col: number) => void;
  search: (query: string, exact: boolean) => void;
  goNext: () => void;
  goPrev: () => void;
  getFilterStatus: () => boolean;
}

interface ArticleGridProps {
  data: (string | number)[][];
  colHeaders: string[];
  onStatusChange?: (status: { isFiltered: boolean }) => void;
  onQuickFilterFocus?: (col: number) => void;
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

const ArticleGrid = forwardRef<ArticleGridHandle, ArticleGridProps>(
  ({ data, colHeaders, onStatusChange, onQuickFilterFocus }, ref) => {
    const hotRef = useRef<HotTableClass | null>(null);
    // Search state for matches
    const matchesRef = useRef<[number, number][]>([]);
    const [matchIndex, setMatchIndex] = useState<number>(0);

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

    const emitStatus = () => {
      const hot = hotRef.current?.hotInstance ?? null;
      const s = computeHotStatus(hot);
      onStatusChange?.(s);
    };

    useImperativeHandle(ref, () => ({
      applyQuickFilter: (col, query, exact) => {
        const hot = hotRef.current?.hotInstance as Handsontable | undefined;
        if (!hot) return;
        const filters = hot.getPlugin("filters");
        if (!filters) return;
        filters.removeConditions(col);
        if (query && query.trim() !== "") {
          const op = exact ? "eq" : "contains";
          // Debug output: log what we are receiving and sending
          const colHeader = colHeaders[col];
          const colData = data.map(row => row[col]);
          const debugMsg = `applyQuickFilter\ncol: ${col} (${colHeader})\nquery: '${query}'\noperator: ${op}\nsampleData: ${JSON.stringify(colData.slice(0, 10))}\n---\n`;
          // Only log to console (browser-safe)
          console.log(debugMsg);
          filters.addCondition(col, op, [query], "conjunction");
        }
        filters.filter();
        emitStatus();
      },
      clearQuickFilter: (col) => {
        const hot = hotRef.current?.hotInstance as Handsontable | undefined;
        if (!hot) return;
        const filters = hot.getPlugin("filters");
        if (!filters) return;
        filters.removeConditions(col);
        filters.filter();
        emitStatus();
      },
      search: (query, exact) => {
        const hot = hotRef.current?.hotInstance as Handsontable | undefined;
        if (!hot) return;
        matchesRef.current = [];
        const q = query.toLowerCase();
        hot.getData().forEach((row, rowIndex) => {
          row.forEach((cell: string | number, colIndex: number) => {
            const value = String(cell ?? "").toLowerCase();
            const match = exact ? value === q : value.includes(q);
            if (match) {
              matchesRef.current.push([rowIndex, colIndex]);
            }
          });
        });
        if (matchesRef.current.length > 0) {
          setMatchIndex(0);
          const [r, c] = matchesRef.current[0];
          const visualRow = hot.toVisualRow(r);
          hot.selectCell(visualRow, c);
        } else {
          setMatchIndex(0);
          alert("🔍 Kein Treffer gefunden");
        }
      },
      goNext: () => {
        const hot = hotRef.current?.hotInstance as Handsontable | undefined;
        if (!hot || matchesRef.current.length === 0) return;
        setMatchIndex((prev) => {
          const next = (prev + 1) % matchesRef.current.length;
          const [r, c] = matchesRef.current[next];
          const visualRow = hot.toVisualRow(r);
          hot.selectCell(visualRow, c);
          return next;
        });
      },
      goPrev: () => {
        const hot = hotRef.current?.hotInstance as Handsontable | undefined;
        if (!hot || matchesRef.current.length === 0) return;
        setMatchIndex((prev) => {
          const next = (prev - 1 + matchesRef.current.length) % matchesRef.current.length;
          const [r, c] = matchesRef.current[next];
          const visualRow = hot.toVisualRow(r);
          hot.selectCell(visualRow, c);
          return next;
        });
      },
      getFilterStatus: () => {
        const hot = hotRef.current?.hotInstance as Handsontable | undefined;
        if (!hot) return false;
        const filters = hot.getPlugin("filters");
        // Check internal _conditions array for any active filter
        if (filters && Array.isArray((filters as unknown as { _conditions: unknown[] })._conditions)) {
          return (filters as unknown as { _conditions: unknown[] })._conditions.some((c) => Array.isArray(c) && c.length > 0);
        }
        return false;
      },
      // Expose matchesRef for parent (search bar) to read match count
      get matchesRef() {
        return matchesRef;
      },
    }));

    // Add afterFilter hook to always update status after any filter action
    const afterFilter = () => {
      emitStatus();
    };

    // Alt+Click: open quick filter for column
    const handleOnCellMouseDown = (event: unknown, coords: { row: number; col: number }) => {
      const e = event as MouseEvent & { altKey?: boolean };
      const hot = hotRef.current?.hotInstance;
      if (e?.altKey && coords?.col != null && coords.col >= 0 && hot) {
        // Select only the clicked cell (not the whole column)
        const r = typeof coords.row === "number" && coords.row >= 0 ? coords.row : hot.getSelectedLast()?.[0] ?? 0;
        hot.selectCell(r, coords.col);
        // Open & focus QuickFilter (parent handles focus)
        if (onQuickFilterFocus) onQuickFilterFocus(coords.col);
        // Deselect cell after Dock focus (triple RAF to overtake HOT focus logic)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              hot.deselectCell?.();
            });
          });
        });
        e.preventDefault?.();
        e.stopPropagation?.();
      }
    };

    return (
      <div style={{ height: "100%", width: "calc(100%)" }}>
        <HotTable
          ref={hotRef}
          data={data} // Pass full data, not filteredData
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
          afterFilter={afterFilter}
          afterOnCellMouseDown={handleOnCellMouseDown}
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
  }
);

export default ArticleGrid;
