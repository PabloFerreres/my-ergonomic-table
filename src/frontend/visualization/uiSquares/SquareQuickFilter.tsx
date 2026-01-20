import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import MSquareContainer from "../uiSquares/MSquareContainer";
import MSquareButton from "../uiSquares/MSquareButton";

export interface QuickFilterHandle {
  focusInput: () => void;
}

interface Props {
  header: string | undefined;
  onApply: (query: string, exact: boolean) => void;
  onClear: () => void;
  value: string;
  setValue: (v: string) => void;
}

const SquareQuickFilter = forwardRef<QuickFilterHandle, Props>(
  ({ header, onApply, onClear, value, setValue }, ref) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [exact, setExact] = useState(false);

    useImperativeHandle(ref, () => ({
      focusInput: () => {
        inputRef.current?.focus();
        inputRef.current?.select();
      },
    }));

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onApply(value, exact);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setValue("");
        onClear();
      }
    };

    return (
      <MSquareContainer width="260px" height="88px">
        <div style={{ fontSize: 12, marginBottom: 4 }}>
          [ALT + CLICK] Quick-Filter {header ? `• ${header}` : ""}
        </div>
        <div style={{ display: "flex", gap: 6, width: "100%" }}>
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Wert eingeben…"
            style={{
              flex: 1,
              padding: "6px 8px",
              borderRadius: 6,
              border: "1px solid #666",
              background: "#111",
              color: "#eee",
              outline: "none",
            }}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input
              type="checkbox"
              checked={exact}
              onChange={(e) => setExact(e.target.checked)}
            />
            Exakt
          </label>
        </div>
        <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
          <MSquareButton onClick={() => onApply(value, exact)}>
            Anwenden
          </MSquareButton>
          <MSquareButton
            onClick={() => {
              setValue("");
              onClear();
            }}
          >
            Löschen
          </MSquareButton>
        </div>
      </MSquareContainer>
    );
  }
);

export default SquareQuickFilter;
