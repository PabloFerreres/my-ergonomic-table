import React from "react";

interface SquareContainerProps {
  children: React.ReactNode;
  backgroundColor?: string;
  width?: string;
  height?: string;
  textColor?: string;
}

const SquareContainer: React.FC<SquareContainerProps> = ({
  children,
  backgroundColor = "rgba(0, 0, 0, 0.6)", // ⬅️ halbtransparent
  width = "200px",
  height = "50px",
  textColor = "#f0e9dc", // ⬅️ heller Text
}) => {
  return (
    <div
      style={{
        width,
        height,
        padding: "10px",
        borderRadius: "6px",
        backgroundColor,
        color: textColor,
        fontWeight: "bold",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center", // ⬅️ zentriert
        boxShadow: "0 2px 8px rgba(0,0,0,0.5)", // optional
      }}
    >
      {children}
    </div>
  );
};

export default SquareContainer;
