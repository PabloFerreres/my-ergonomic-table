import React from "react";
import { createRoot } from "react-dom/client";
import ArticleVisualizer from "./ArticleVisualizer";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ArticleVisualizer />
  </React.StrictMode>
);
