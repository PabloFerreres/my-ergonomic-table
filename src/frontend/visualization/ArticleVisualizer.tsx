import React, { useEffect, useState } from "react";
import Zoom from "./uiButtonFunctions/Zoom";
import ArticleGrid from "./ArticleGrid";
import config from "../../../config.json";
import "./ArticleVisualizer.custom.css";
import SquareQuickFilter from "./uiSquares/SquareQuickFilter";
import SquareFilter from "./uiButtonFunctions/FilterStatus";
import SquareSearch from "./uiSquares/SquareSearch";

const API_PREFIX = config.BACKEND_URL || "";
const ZOOM_CONTAINER_WIDTH = "90vw"; // Easily adjustable width

const ArticleVisualizer: React.FC = () => {
  const [headers, setHeaders] = useState<string[]>([]);
  const [data, setData] = useState<(string | number)[][]>([]);
  const [activeTable, setActiveTable] = useState<5 | 6>(6); // Default to articles (6)

  // Add filter/search state
  const [quickFilter, setQuickFilter] = useState("");
  const [isFilterActive, setIsFilterActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const [searchMatchCount, setSearchMatchCount] = useState(0);

  // Dummy handlers for now
  const handleQuickFilterApply = (query: string, exact: boolean) => {
    setQuickFilter(query);
    setIsFilterActive(!!query);
    // TODO: filter ArticleGrid data
  };
  const handleQuickFilterClear = () => {
    setQuickFilter("");
    setIsFilterActive(false);
    // TODO: reset ArticleGrid filter
  };
  const handleResetFilters = () => {
    setQuickFilter("");
    setIsFilterActive(false);
    // TODO: reset ArticleGrid filter
  };
  const handleSearch = (query: string, exact: boolean) => {
    setSearchQuery(query);
    // TODO: search ArticleGrid data
    setSearchMatchIndex(0);
    setSearchMatchCount(0);
  };
  const handleSearchNext = () => {
    setSearchMatchIndex((i) => Math.min(i + 1, searchMatchCount - 1));
  };
  const handleSearchPrev = () => {
    setSearchMatchIndex((i) => Math.max(i - 1, 0));
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
    fetch(`${API_PREFIX}/api/articles_table?table=${activeTable}`)
      .then((res) => res.json())
      .then((result) => {
        setHeaders(result.headers || []);
        setData(result.data || []);
      });
  }, [activeTable]);

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
          // Use the same top as sheet buttons, but anchor the bottom of the bar to this line
          top: "calc(50% - 40vh - 65px)", // move higher by increasing the negative offset
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
            padding: "0px 16px 5px 16px", // remove bottom padding so bottom edge is flush
            borderRadius: 8,
            boxShadow: "0 2px 8px rgba(0,0,0,0.10)",
            alignItems: "flex-end",
          }}
        >
          <SquareFilter
            isFilterActive={isFilterActive}
            onResetFilters={handleResetFilters}
          />
          <SquareQuickFilter
            header={headers[0]}
            onApply={handleQuickFilterApply}
            onClear={handleQuickFilterClear}
          />
          <SquareSearch
            onSearch={handleSearch}
            onNext={handleSearchNext}
            onPrev={handleSearchPrev}
            matchIndex={searchMatchIndex}
            matchCount={searchMatchCount}
          />
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
                    data={data}
                    colHeaders={headers}
                    quickFilter={quickFilter}
                    searchQuery={searchQuery}
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
