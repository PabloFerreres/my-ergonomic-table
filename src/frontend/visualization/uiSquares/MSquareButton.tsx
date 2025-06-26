import React from "react";

interface SquareButtonProps {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  width?: string;
  height?: string;
}

const SquareButton: React.FC<SquareButtonProps> = ({
  onClick,
  disabled = false,
  children,
  width = "100px",
  height = "25px",
}) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width,
        height,
        backgroundColor: "#eeeeee",
        border: "4px solid rgb(172, 172, 172)",
        borderRadius: "4px",
        cursor: "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
};

export default SquareButton;
