import React from "react";
import SquareContainer from "../uiSquares/MSquareContainer";

interface FilterStatusProps {
  isFilterActive: boolean;
  onResetFilters: () => void;
}

const SquareFilter: React.FC<FilterStatusProps> = ({
  isFilterActive,
  onResetFilters,
}) => {
  return (
    <SquareContainer
      width="150px"
      backgroundColor={
        isFilterActive ? "rgb(255, 109, 109)" : "rgb(168, 252, 168)"
      }
      textColor={isFilterActive ? "     #990000" : " #006600"}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: "18px" }}>{isFilterActive ? "⚠️" : "✅"}</span>
        <span>{isFilterActive ? "Filter aktiv" : "Kein Filter aktiv"}</span>
      </div>

      <button
        onClick={onResetFilters}
        style={{
          padding: "4px 8px",
          backgroundColor: "#eeeeee",
          border: "1px solid #cccccc",
          borderRadius: "4px",
          cursor: "pointer",
        }}
      >
        Filter zurücksetzen
      </button>
    </SquareContainer>
  );
};

export default SquareFilter;
