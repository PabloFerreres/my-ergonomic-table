import React, { useMemo, useCallback, useEffect, useState } from "react";
import { HotTable, HotTableClass } from "@handsontable/react";
import "handsontable/dist/handsontable.full.min.css";
import { registerAllModules } from "handsontable/registry";
registerAllModules();

import "./TableGrid.css";
import "./TableGrid.custom.css";
import {
  afterGetColHeader,
  useHeaderTraits,
  buildColumnDefs,
} from "./uiTableGrid/TableGridConsts";
import { useDropdownColumns, useDropdownOptions } from "../hooks/useDropdowns";
import { useCellProperties } from "../hooks/useCellProperties";
import { useAfterChange } from "../hooks/useAfterChange";
import { useAfterUndo } from "../hooks/useAfterUndo";
// import { useAfterRowMove } from "../hooks/useAfterRowMove";
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
  sheetName: string;
  isBlocked?: boolean;
  onQuickFilterFocus?: (col: number) => void; // Alt+Click -> QuickFilter
  onSearchShortcut?: () => void; // Ctrl+F -> Searchbar
  selectedProject: Project;
  onStatusChange?: (s: { isFiltered: boolean; isSorted: boolean }) => void;
}

interface ColumnMapEntry {
  name: string;
  name_external_german: string;
  tables: string[];
  data_source: string;
}

function TableGrid({
  data,
  colHeaders,
  colWidths,
  rowHeights,
  hotRef,
  sheetName,
  isBlocked = false,
  onQuickFilterFocus,
  onSearchShortcut,
  selectedProject,
  onStatusChange,
}: TableGridProps) {
  const colCount = colHeaders.length;
  const safeData = useMemo<(string | number)[][]>(() => {
    if (Array.isArray(data) && data.length === 0 && colCount > 0) {
      return [Array(colCount).fill("") as (string | number)[]];
    }
    return data;
  }, [data, colCount]);

  // --- Header traits for color ---
  const traitsMap = useHeaderTraits(colHeaders);

  const rowIdIndex = colHeaders.indexOf("project_article_id");

  const { dropdowns } = useDropdownOptions(selectedProject.id, colHeaders);
  const columnDefsRaw = useDropdownColumns(colHeaders, dropdowns);
  console.debug(
    "HOT columns",
    columnDefsRaw.map((c) => c.type)
  );

  const baseCellProps = useCellProperties(safeData, rowIdIndex, sheetName);

  // --- ReadOnly columns logic ---
  const [columnDataSources, setColumnDataSources] = useState<
    Record<string, string>
  >({});
  useEffect(() => {
    fetch(`${API_PREFIX}/api/columns_map`)
      .then((res) => res.json())
      .then((cols: ColumnMapEntry[]) => {
        const dataSourceMap: Record<string, string> = {};
        cols.forEach((c) => {
          if (c.name_external_german) {
            dataSourceMap[c.name_external_german] = c.data_source;
          }
        });
        // Ensure order_key is always 'intern' for color and logic
        dataSourceMap["order_key"] = "intern";
        setColumnDataSources(dataSourceMap);
      });
  }, [colHeaders]);

  // Custom cell properties to set readOnly for project_articles and articles columns
  const getCellProps = useCallback(
    (row: number, col: number) => {
      const props = baseCellProps(row, col) as Handsontable.CellProperties;
      const header = colHeaders[col];
      const dataSource = columnDataSources[header];
      // Static read-only columns
      if (header === "order_key" || header === "project_article_id") {
        props.readOnly = true;
        return props;
      }
      // Read-only if data_source is intern, cad, or articles (unless articles and no article_id)
      if (["intern", "cad", "articles"].includes(dataSource)) {
        if (dataSource === "articles") {
          const articleIdColIdx = colHeaders.indexOf("article_id");
          const articleId =
            articleIdColIdx >= 0 ? safeData[row]?.[articleIdColIdx] : undefined;
          if (
            articleId !== undefined &&
            articleId !== null &&
            articleId !== "" &&
            !isNaN(Number(articleId))
          ) {
            props.readOnly = true;
          } else {
            props.readOnly = false;
          }
        } else {
          props.readOnly = true;
        }
      } else {
        props.readOnly = false;
      }
      return props;
    },
    [baseCellProps, colHeaders, columnDataSources, safeData]
  );

  // Only these columns are editable
  // const editableColumns = ["Status", "Lieferumfang"];

  // Use traitsMap for columnDefs
  const columnDefs = buildColumnDefs(colHeaders, traitsMap);

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

  // const onRowMove = useAfterRowMove(
  //   safeData,
  //   rowIdIndex,
  //   sheetName,
  //   hotRef?.current?.hotInstance ?? null,
  //   colHeaders,
  //   selectedProject.id
  // );

  const emitStatus = () => {
    const hot = hotRef?.current?.hotInstance ?? null;
    const s = computeHotStatus(hot);
    onStatusChange?.(s);
  };

  type CellMetaWithHeader = { _hetRowState?: { isHeader?: boolean } } & Record<
    string,
    unknown
  >;

  const selectionHasHeader = (): boolean => {
    const hot = hotRef?.current?.hotInstance;
    if (!hot) return false;
    const sel = hot.getSelected();
    if (!sel) return false;

    for (const [r1, , r2] of sel) {
      const from = Math.min(r1, r2);
      const to = Math.max(r1, r2);
      for (let r = from; r <= to; r++) {
        const meta = hot.getCellMeta(r, 0) as CellMetaWithHeader;
        if (meta?._hetRowState?.isHeader === true) return true;
      }
    }
    return false;
  };

  // Alt+Enter: newline; Ctrl+Enter: commit & stay; Ctrl+F: Search öffnen
  const handleGridKeys = useCallback(
    (e: KeyboardEvent) => {
      const hot = hotRef?.current?.hotInstance;
      if (!hot) return;

      // Ctrl/Cmd+F -> Search-Dock
      if (
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey &&
        !e.altKey &&
        String(e.key).toLowerCase() === "f"
      ) {
        onSearchShortcut?.();
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return;
      }

      const isEnter = e.key === "Enter";

      // Ctrl+Enter -> commit & bleiben
      if (isEnter && e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
        const editor =
          (hot.getActiveEditor?.() as Handsontable.editors.BaseEditor | null) ??
          null;
        if (editor?.isOpened?.()) {
          editor.finishEditing?.();
        } else {
          const sel = hot.getSelectedLast();
          if (sel) hot.selectCell(sel[0], sel[1]);
        }
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return;
      }

      // Alt+Enter -> echter Zeilenumbruch in der Zelle
      if (isEnter && e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
        const editor =
          (hot.getActiveEditor?.() as Handsontable.editors.BaseEditor | null) ??
          null;
        if (!editor || !editor.isOpened?.()) return;

        const textEditor = editor as Handsontable.editors.TextEditor;
        const textarea = textEditor.TEXTAREA as HTMLTextAreaElement | undefined;
        if (!textarea) return;

        const s = textarea.selectionStart ?? textarea.value.length;
        const t = textarea.selectionEnd ?? textarea.value.length;
        const v = textarea.value ?? "";
        const next = v.slice(0, s) + "\n" + v.slice(t);

        textarea.value = next;
        editor.setValue?.(next);
        textarea.selectionStart = textarea.selectionEnd = s + 1;

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    },
    [hotRef, onSearchShortcut]
  );

  // lokale, schlanke Typdefinition für DropdownMenu-Plugin (kein any)
  type DropdownMenuPlugin = {
    close?: () => void;
    menu?: { close?: () => void } | null;
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
        dropdownMenu={{
          items: [
            "filter_by_condition",
            "filter_operators",
            "filter_by_value",
            "filter_action_bar",
          ],
        }}
        width="100%"
        height="100%"
        stretchH="none"
        licenseKey="non-commercial-and-evaluation"
        fixedColumnsLeft={1}
        afterOnCellMouseDown={(event, coords) => {
          const hot = hotRef?.current?.hotInstance ?? null;
          if (event?.altKey && coords?.col != null && coords.col >= 0 && hot) {
            // 1) Select only the clicked cell (not the whole column)
            const r =
              typeof coords.row === "number" && coords.row >= 0
                ? coords.row
                : hot.getSelectedLast()?.[0] ?? 0;
            hot.selectCell(r, coords.col);

            // 2) Open & focus QuickFilter (App Dock handles focus)
            onQuickFilterFocus?.(coords.col);

            // 3) Deselect cell after Dock focus (triple RAF to overtake HOT focus logic)
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  hot.deselectCell?.();
                });
              });
            });

            event.preventDefault();
            event.stopPropagation();
          }
        }}
        beforeKeyDown={handleGridKeys}
        afterGetColHeader={(col, TH) =>
          afterGetColHeader(col, TH, colHeaders, traitsMap, columnDataSources)
        }
        afterFilter={() => {
          const hot = hotRef?.current?.hotInstance ?? null;
          if (!hot) return;

          const dm = hot.getPlugin(
            "dropdownMenu"
          ) as unknown as DropdownMenuPlugin;

          setTimeout(() => {
            dm?.close?.();
            dm?.menu?.close?.();
          }, 0);

          Promise.resolve().then(() => emitStatus());
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

                // Selection is read directly from Handsontable here
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
            send_to_article_visualizer: {
              name: "Show in ArticleVisualizer 🔎",
              disabled: () => {
                if (isBlocked || selectionHasHeader()) return true;
                const hot = hotRef?.current?.hotInstance;
                if (!hot) return true;
                const selected = hot.getSelectedLast();
                if (!selected) return true;
                const row = selected[0];
                const articleIdCol = colHeaders.indexOf("article_id") >= 0
                  ? colHeaders.indexOf("article_id")
                  : colHeaders.indexOf("project_article_id");
                if (articleIdCol < 0) return true;
                const rowData = hot.getSourceDataAtRow(row);
                let articleId = null;
                if (Array.isArray(rowData)) {
                  articleId = rowData[articleIdCol];
                } else if (rowData && typeof rowData === 'object') {
                  const header = colHeaders[articleIdCol];
                  articleId = rowData[header];
                }
                return !articleId;
              },
              callback: function () {
                const hot = hotRef?.current?.hotInstance;
                if (!hot || selectionHasHeader()) return;
                const selected = hot.getSelectedLast();
                if (!selected) return;
                const row = selected[0];
                const articleIdCol = colHeaders.indexOf("article_id") >= 0
                  ? colHeaders.indexOf("article_id")
                  : colHeaders.indexOf("project_article_id");
                if (articleIdCol < 0) {
                  uiConsole("No article_id or project_article_id column found!");
                  return;
                }
                const rowData = hot.getSourceDataAtRow(row);
                let articleId = null;
                if (Array.isArray(rowData)) {
                  articleId = rowData[articleIdCol];
                } else if (rowData && typeof rowData === 'object') {
                  const header = colHeaders[articleIdCol];
                  articleId = rowData[header];
                }
                if (!articleId) {
                  uiConsole("No article_id found in selected row!");
                  return;
                }
                // Send message to ArticleVisualizer window
                // @ts-expect-error: custom property for ArticleVisualizerWindow
                const win = window.ArticleVisualizerWindow;
                if (win && !win.closed) {
                  win.postMessage({ type: "show-article", articleId }, "*");
                  win.focus();
                } else {
                  // Optionally, open the window if not open
                  // @ts-expect-error: set custom property
                  window.ArticleVisualizerWindow = window.open(
                    "/article-visualizer.html",
                    "ArticleVisualizerWindow",
                    "width=1400,height=700"
                  );
                  setTimeout(() => {
                    // Try again after window is ready
                    // @ts-expect-error: custom property
                    window.ArticleVisualizerWindow?.postMessage?.({ type: "show-article", articleId }, "*");
                  }, 1000);
                }
              },
            },
            open_article_doc_folder: {
              name: "Open Article Documentation Folder 📂",
              disabled: () => {
                if (isBlocked || selectionHasHeader()) return true;
                const hot = hotRef?.current?.hotInstance;
                if (!hot) return true;
                const selected = hot.getSelectedLast();
                if (!selected) return true;
                const row = selected[0];
                const articleIdCol = colHeaders.indexOf("article_id");
                if (articleIdCol < 0) return true;
                const rowData = hot.getSourceDataAtRow(row);
                let articleId = null;
                if (Array.isArray(rowData)) {
                  articleId = rowData[articleIdCol];
                } else if (rowData && typeof rowData === 'object') {
                  const header = colHeaders[articleIdCol];
                  articleId = rowData[header];
                }
                return !articleId;
              },
              callback: async function () {
                const hot = hotRef?.current?.hotInstance;
                if (!hot || selectionHasHeader()) return;
                const selected = hot.getSelectedLast();
                if (!selected) return;
                const row = selected[0];
                const articleIdCol = colHeaders.indexOf("article_id");
                if (articleIdCol < 0) {
                  uiConsole("No article_id column found!");
                  return;
                }
                const revCol = colHeaders.indexOf("article_revision_char");
                const rowData = hot.getSourceDataAtRow(row);
                let articleId = null;
                let revision = null;
                if (Array.isArray(rowData)) {
                  articleId = rowData[articleIdCol];
                  if (revCol >= 0) revision = rowData[revCol];
                } else if (rowData && typeof rowData === 'object') {
                  const header = colHeaders[articleIdCol];
                  articleId = rowData[header];
                  if (revCol >= 0) revision = rowData[colHeaders[revCol]];
                }
                if (!articleId) {
                  uiConsole("No article_id found in selected row!");
                  return;
                }
                // Build the path
                const basePath = config.ARTICLE_DOCUMENTATION_PATH;
                let folderPath = `${basePath}\\article_id(${articleId})`;
                if (revision) {
                  folderPath += `\\rev(${revision})`;
                }
                try {
                  const res = await fetch(`${API_PREFIX}/api/open-explorer`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ path: folderPath })
                  });
                  if (!res.ok) {
                    const msg = await res.text();
                    uiConsole(`Failed to open folder: ${msg}`);
                  }
                } catch (err) {
                  uiConsole(`Error opening folder: ${err}`);
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
        manualRowMove={false}
        beforeRowMove={() => false}
        afterRowMove={undefined}
        afterChange={onChange}
        afterCreateRow={(_index: number, _amount: number) => {
          void _index;
          void _amount;
          if (isBlocked) return;
          const hot = hotRef?.current?.hotInstance;
          if (!hot) return;
          setTimeout(() => {
            const sourceData = (hot.getSourceData?.() ?? safeData) as (
              | string
              | number
            )[][];
            const map = buildVisualPositionMap(
              sheetName,
              hot,
              colHeaders,
              sourceData
            );
            if (map) {
              const rowsForApi = map.rows.map(
                ({ project_article_id, position }) => ({
                  project_article_id,
                  position,
                })
              );
              sendPositionMap(map.sheet, rowsForApi, selectedProject.id);
            }
          }, 0);
        }}
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
            if (map) {
              const rowsForApi = map.rows.map(
                ({ project_article_id, position }) => ({
                  project_article_id,
                  position,
                })
              );
              sendPositionMap(map.sheet, rowsForApi, selectedProject.id);
            }
          }
        }}
      />
    </div>
  );
}

export default TableGrid;
