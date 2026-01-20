import React, { useEffect, useState } from "react";
import Zoom from "./uiButtonFunctions/Zoom";
import ArticleGrid from "./ArticleGrid";
import config from "../../../config.json";
import "./ArticleVisualizer.custom.css";

const API_PREFIX = config.BACKEND_URL || "";
const ZOOM_CONTAINER_WIDTH = "90vw"; // Easily adjustable width

const ArticleVisualizer: React.FC = () => {
  const [headers, setHeaders] = useState<string[]>([]);
  const [data, setData] = useState<(string | number)[][]>([]);
  const [activeTable, setActiveTable] = useState<5 | 6>(5);

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
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        <div className="articlevisualizer-filter-buttons">
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
                  right: "10px", // 5px buffer from right edge
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: ZOOM_CONTAINER_WIDTH, // Use the parameter here
                  height: "80vh", // adjust as needed
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
                  <ArticleGrid data={data} colHeaders={headers} />
                </div>
              </div>
              <div
                style={{
                  position: "absolute",
                  right: "10px", // 5px buffer from right edge
                  top: `calc(50% + 40vh)`, // below the zoom box
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
