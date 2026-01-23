import React from "react";

interface DropdownProps {
  options: number[];
  value: number;
  onChange: (value: number) => void;
}

const Dropdown: React.FC<DropdownProps> = ({ options, value, onChange }) => {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{
        padding: "8px",
        borderRadius: "4px",
        border: "1px solid #ccc",
        background: "#fff",
        cursor: "pointer",
      }}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option} Colors
        </option>
      ))}
    </select>
  );
};

export default Dropdown;
