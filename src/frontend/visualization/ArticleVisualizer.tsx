import React, { useEffect, useState, useRef } from "react";
import Zoom from "./uiButtonFunctions/Zoom";
import ArticleGrid from "./ArticleGrid";
import config from "../../../config.json";
import "./ArticleVisualizer.custom.css";
import SquareQuickFilter from "./uiSquares/SquareQuickFilter";
import SquareFilter from "./uiButtonFunctions/FilterStatus";
import SquareSearch from "./uiSquares/SquareSearch";
import type { ArticleGridHandle } from "./ArticleGrid";
import { ConsolePanel } from "./uiSquares/ConsolePanel";
import { subscribeToConsole, unsubscribeFromConsole, uiConsole } from "../utils/uiConsole";

const API_PREFIX = config.BACKEND_URL || "";
const ZOOM_CONTAINER_WIDTH = "90vw"; // Easily adjustable width

const ArticleVisualizer: React.FC = () => {
  const [headers, setHeaders] = useState<string[]>([]);
  const [data, setData] = useState<(string | number)[][]>([]);
  const [activeTable, setActiveTable] = useState<5 | 6 | "article_search">(6); // Add 'article_search' as a possible sheet
  const [searchResult, setSearchResult] = useState<{
    headers: string[];
    data: (string | number)[][];
  } | null>(null);
  const [isFilterActive, setIsFilterActive] = useState(false);
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const [searchMatchCount, setSearchMatchCount] = useState(0);
  const [quickFilterCol, setQuickFilterCol] = useState<number>(0);
  const [quickFilterInput, setQuickFilterInput] = useState<string>("");
  const [consoleLogs, setConsoleLogs] = useState<
    { text: string; time: string }[]
  >([]);
  const [draftRow, setDraftRow] = useState<Record<string, string | number> | null>(null);

  const articleGridRef = useRef<ArticleGridHandle>(null);

  const handleQuickFilterApply = (query: string, exact: boolean) => {
    setQuickFilterInput(query);
    if (articleGridRef.current) {
      articleGridRef.current.applyQuickFilter(quickFilterCol, query, exact);
    }
  };
  const handleQuickFilterClear = () => {
    setQuickFilterInput("");
    if (articleGridRef.current) {
      articleGridRef.current.clearQuickFilter(quickFilterCol);
    }
  };
  const handleResetFilters = () => {
    if (articleGridRef.current) {
      for (let col = 0; col < headers.length; col++) {
        articleGridRef.current.clearQuickFilter(col);
      }
      // isFilterActive will be set by onStatusChange
    }
  };
  const handleSearch = (query: string, exact: boolean) => {
    if (articleGridRef.current) {
      articleGridRef.current.search(query, exact);
      // After search, update match count and reset index to 0
      const matches = articleGridRef.current.matchesRef?.current || [];
      setSearchMatchIndex(matches.length > 0 ? 0 : 0);
      setSearchMatchCount(matches.length);
    } else {
      setSearchMatchIndex(0);
      setSearchMatchCount(0);
    }
  };
  const handleSearchNext = () => {
    if (articleGridRef.current) {
      // Always compute the next index based on the current match index
      const matches = articleGridRef.current.matchesRef?.current || [];
      if (matches.length === 0) return;
      const nextIndex = (searchMatchIndex + 1) % matches.length;
      setSearchMatchIndex(nextIndex);
      // Select the next match
      const [r, c] = matches[nextIndex];
      const hot = articleGridRef.current?.hotRef?.current?.hotInstance;
      if (hot) {
        const visualRow = hot.toVisualRow ? hot.toVisualRow(r) : r;
        hot.selectCell(visualRow, c);
      } else {
        articleGridRef.current.goNext();
      }
    }
  };
  const handleSearchPrev = () => {
    if (articleGridRef.current) {
      const matches = articleGridRef.current.matchesRef?.current || [];
      if (matches.length === 0) return;
      const prevIndex =
        (searchMatchIndex - 1 + matches.length) % matches.length;
      setSearchMatchIndex(prevIndex);
      // Select the previous match
      const [r, c] = matches[prevIndex];
      const hot = articleGridRef.current?.hotRef?.current?.hotInstance;
      if (hot) {
        const visualRow = hot.toVisualRow ? hot.toVisualRow(r) : r;
        hot.selectCell(visualRow, c);
      } else {
        articleGridRef.current.goPrev();
      }
    }
  };

  const handleQuickFilterFocus = (col: number) => {
    setQuickFilterCol(col);
    setQuickFilterInput(""); // Clear input for new column
    // Focus the input after a short delay to ensure UI is ready
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>(
        "input[placeholder='Wert eingeben…']"
      );
      input?.focus();
      input?.select();
    }, 100);
  };

  useEffect(() => {
    // Block only the main window scrollbars, not the grid's
    const originalOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = originalOverflow;
    };
  }, []);

  useEffect(() => {
    if (activeTable === "article_search") return; // Don't fetch for search sheet
    fetch(`${API_PREFIX}/api/articles_table?table=${activeTable}`)
      .then((res) => res.json())
      .then((result) => {
        setHeaders(result.headers || []);
        setData(result.data || []);
      });
  }, [activeTable]);

  useEffect(() => {
    function handleShowArticleMessage(event: MessageEvent) {
      if (!event.data || event.data.type !== "show-article") return;
      const articleId = event.data.articleId;
      if (!articleId || !headers.length || !data.length) return;
      // Find the article_id column
      const articleIdCol = headers.indexOf("article_id");
      if (articleIdCol < 0) return;
      // Find the row with the matching article_id (exact match, string or number)
      const rowIndex = data.findIndex(
        (row) => String(row[articleIdCol]) === String(articleId)
      );
      if (rowIndex >= 0 && articleGridRef.current) {
        // Select and scroll to the cell
        const hot = articleGridRef.current.hotRef?.current?.hotInstance;
        if (hot) {
          const visualRow = hot.toVisualRow
            ? hot.toVisualRow(rowIndex)
            : rowIndex;
          hot.selectCells([[visualRow, articleIdCol, visualRow, articleIdCol]]);
          hot.scrollViewportTo(visualRow, articleIdCol, true, true);
        } else {
          // fallback: use search logic
          articleGridRef.current.search(String(articleId), true);
        }
      }
    }
    window.addEventListener("message", handleShowArticleMessage);
    return () =>
      window.removeEventListener("message", handleShowArticleMessage);
  }, [headers, data]);

  useEffect(() => {
    function handleShowComparison(event: MessageEvent) {
      if (!event.data || event.data.type !== "show-comparison") return;
      const comparison = event.data.comparison;
      if (!comparison || !comparison.headers || !comparison.results) return;
      setSearchResult({
        headers: comparison.headers,
        data: comparison.results.map(
          (r: { row: Record<string, string | number> }) =>
            comparison.headers.map((h: string) => r.row[h])
        ),
      });
      setActiveTable("article_search");
      setDraftRow(comparison.draft_row || null);
      // Debug print for cell coloring
      if (comparison.draft_row && comparison.results) {
        const debugRows: string[] = [];
        (comparison.results as Array<{ row: Record<string, string | number> }>).forEach((result: { row: Record<string, string | number> }, rowIdx: number) => {
          (comparison.headers as string[]).forEach((colName: string, colIdx: number) => {
            const draftVal = comparison.draft_row[colName];
            if (draftVal === undefined || draftVal === null || String(draftVal).trim() === "") return;
            const cellVal = String(result.row[colName] ?? "").toLowerCase();
            const draftValStr = String(draftVal).toLowerCase();
            let color = "NO COLOR";
            if (cellVal === "" && draftValStr !== "") {
              color = "RED (cell empty, draft has data)";
            } else if (cellVal.includes(draftValStr)) {
              color = "GREEN (cell contains draft)";
            } else if (draftValStr !== "" && cellVal !== "" && !cellVal.includes(draftValStr)) {
              color = "RED (cell does not contain draft)";
            }
            debugRows.push(`[DEBUG] row=${rowIdx}, col=${colIdx} (${colName}), draftVal='${draftValStr}', cellVal='${cellVal}' => ${color}`);
          });
        });
        if (debugRows.length > 0) {
          // Write debug output to debug.txt
          fetch("/debug.txt", {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: debugRows.join("\n") + "\n",
          });
        }
      }
      // Count perfect matches (all columns match exactly, case-insensitive)
      const perfectMatches = comparison.results.filter((r: { perfect_match?: boolean }) => r.perfect_match === true).length;
      uiConsole(`Article search: ${perfectMatches} perfect match${perfectMatches === 1 ? "" : "es"} found.`);
    }
    window.addEventListener("message", handleShowComparison);
    return () => window.removeEventListener("message", handleShowComparison);
  }, []);

  useEffect(() => {
    const handler = (entry: { text: string; time: string }) => {
      setConsoleLogs((prev) => [...prev.slice(-99), entry]);
    };
    subscribeToConsole(handler);
    return () => unsubscribeFromConsole(handler);
  }, []);

  useEffect(() => {
    // Debug print for cell highlighting in article_search
    if (activeTable === "article_search" && searchResult && draftRow) {
      const debugRows: string[] = [];
      searchResult.data.forEach((row: (string | number)[], rowIdx: number) => {
        searchResult.headers.forEach((colName: string, colIdx: number) => {
          const draftVal = draftRow[colName];
          if (draftVal === undefined || draftVal === null || String(draftVal).trim() === "") return;
          const cellVal = String(row[colIdx] ?? "").toLowerCase();
          const draftValStr = String(draftVal).toLowerCase();
          let color = "NO COLOR";
          if (cellVal === "" && draftValStr !== "") {
            color = "RED (cell empty, draft has data)";
          } else if (cellVal.includes(draftValStr)) {
            color = "GREEN (cell contains draft)";
          } else if (draftValStr !== "" && cellVal !== "" && !cellVal.includes(draftValStr)) {
            color = "RED (cell does not contain draft)";
          }
          debugRows.push(`[DEBUG] row=${rowIdx}, col=${colIdx} (${colName}), draftVal='${draftValStr}', cellVal='${cellVal}' => ${color}`);
        });
      });
      if (debugRows.length > 0) {
        console.log("=== ArticleVisualizer Cell Highlight Debug ===\n" + debugRows.join("\n"));
      }
    }
  }, [activeTable, searchResult, draftRow]);

  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        background: "#f6f6f6",
        overflow: "hidden",
      }}
    >
      {/* Top bar placeholder for spacing, simulating App's top controls */}
      <div style={{ height: 56, minHeight: 56 }} />
      {/* Top filter/search bar container, bottom edge touching the top blue border of the grid container */}
      <div
        style={{
          position: "absolute",
          right: "10px",
          top: "10px", // changed from 10px to 0 for flush alignment
          zIndex: 202,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          width: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            gap: 16,
            background: "#f6f6f6",
            padding: "0px 16px 5px 16px",
            borderRadius: 8,
            boxShadow: "0 2px 8px rgba(0,0,0,0.10)",
            alignItems: "flex-start",
            minWidth: 600,
            justifyContent: "space-between", // changed from flex-start for left/right alignment
          }}
        >
          {/* Left: filter/search controls */}
          <div
            style={{ display: "flex", flexDirection: "row", gap: 10, flex: 1 }}
          >
            <SquareFilter
              isFilterActive={isFilterActive}
              onResetFilters={handleResetFilters}
            />
            <SquareQuickFilter
              header={headers[quickFilterCol]}
              onApply={handleQuickFilterApply}
              onClear={handleQuickFilterClear}
              value={quickFilterInput}
              setValue={setQuickFilterInput}
            />
            <SquareSearch
              onSearch={handleSearch}
              onNext={handleSearchNext}
              onPrev={handleSearchPrev}
              matchIndex={searchMatchIndex}
              matchCount={searchMatchCount}
            />
          </div>
          {/* Right: ConsolePanel, aligned to same top as search */}
          <div
            style={{
              width: 320,
              minWidth: 220,
              maxHeight: 80,
              marginLeft: 0,
              display: "flex",
              alignItems: "flex-start", // aligns top with search
              height: "100%", // match height of row
            }}
          >
            <ConsolePanel logs={consoleLogs} />
          </div>
        </div>
      </div>
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        {/* Sheet buttons absolutely positioned relative to the grid container, just above the blue box */}
        <div
          className="articlevisualizer-filter-buttons"
          style={{
            position: "absolute",
            left: "calc(10vw + 0px)", // aligns with blue container's left
            top: "calc(50% - 40vh - 40px)", // 40px above blue box (adjust as needed)
            zIndex: 200,
            display: "flex",
            gap: 8,
            background: "#f6f6f6",
            padding: "4px 0",
            borderRadius: 6,
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            width: "auto",
            justifyContent: "flex-start",
            alignItems: "flex-end",
          }}
        >
          <button
            onClick={() => setActiveTable(5)}
            style={{
              marginRight: 8,
              background: activeTable === 5 ? "#6a6aff" : "#eee",
              color: activeTable === 5 ? "#fff" : "#222",
              border: "1px solid #bbb",
              borderRadius: 4,
              padding: "4px 12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            motor_articles
          </button>
          <button
            onClick={() => setActiveTable(6)}
            style={{
              background: activeTable === 6 ? "#6a6aff" : "#eee",
              color: activeTable === 6 ? "#fff" : "#222",
              border: "1px solid #bbb",
              borderRadius: 4,
              padding: "4px 12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            articles
          </button>
          <button
            onClick={() => setActiveTable("article_search")}
            style={{
              background: activeTable === "article_search" ? "#6a6aff" : "#eee",
              color: activeTable === "article_search" ? "#fff" : "#222",
              border: "1px solid #bbb",
              borderRadius: 4,
              padding: "4px 12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
            disabled={!searchResult}
          >
            article_search
          </button>
        </div>
        <Zoom>
          {(zoom, controls) => (
            <>
              <div
                style={{
                  position: "absolute",
                  right: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: ZOOM_CONTAINER_WIDTH,
                  height: "80vh",
                  background: "#e0e0ff",
                  border: "2px solid #6a6aff",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                  display: "block",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    transform: `scale(${zoom})`,
                    transformOrigin: "top left",
                    width: `${100 / zoom}%`,
                    height: `${100 / zoom}%`,
                    background: "#fffbe6",
                    border: "2px dashed #ffb300",
                    overflow: "visible",
                    display: "block",
                  }}
                >
                  <ArticleGrid
                    ref={articleGridRef}
                    data={
                      activeTable === "article_search" && searchResult
                        ? searchResult.data
                        : data
                    }
                    colHeaders={
                      activeTable === "article_search" && searchResult
                        ? searchResult.headers
                        : headers
                    }
                    onStatusChange={({ isFiltered }) =>
                      setIsFilterActive(isFiltered)
                    }
                    onQuickFilterFocus={handleQuickFilterFocus}
                    draftRow={activeTable === "article_search" && searchResult ? draftRow : null}
                  />
                </div>
              </div>
              <div
                style={{
                  position: "absolute",
                  right: "10px",
                  top: `calc(50% + 40vh)`,
                  width: ZOOM_CONTAINER_WIDTH,
                  display: "flex",
                  justifyContent: "flex-end",
                  padding: "4px",
                }}
              >
                {controls}
              </div>
            </>
          )}
        </Zoom>
      </div>
    </div>
  );
};

export default ArticleVisualizer;
