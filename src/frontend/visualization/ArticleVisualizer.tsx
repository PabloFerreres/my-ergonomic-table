import React, { useEffect, useState } from "react";
import Zoom from "./uiButtonFunctions/Zoom";
import ArticleGrid from "./ArticleGrid";
import config from "../../../config.json";

const API_PREFIX = config.BACKEND_URL || "";
const ZOOM_CONTAINER_WIDTH = "90vw"; // Easily adjustable width

const ArticleVisualizer: React.FC = () => {
  const [headers, setHeaders] = useState<string[]>([]);
  const [data, setData] = useState<(string | number)[][]>([]);

  useEffect(() => {
    // Block only the main window scrollbars, not the grid's
    const originalOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = originalOverflow;
    };
  }, []);

  useEffect(() => {
    fetch(`${API_PREFIX}/api/articles_table`)
      .then((res) => res.json())
      .then((result) => {
        setHeaders(result.headers || []);
        setData(result.data || []);
      });
  }, []);

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
  );
};

export default ArticleVisualizer;
