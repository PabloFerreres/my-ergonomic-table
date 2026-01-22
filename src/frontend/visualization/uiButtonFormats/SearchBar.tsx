import React, {
  useState,
  useRef,
  useImperativeHandle,
  forwardRef,
} from "react";
import MSquareButton from "../uiSquares/MSquareButton";

interface SearchBarProps {
  onSearch: (query: string, exactMatch: boolean) => void;
  onNext: () => void;
  onPrev: () => void;
  matchIndex: number;
  matchCount: number;
}

export interface SearchBarHandle {
  focusInput: () => void;
}

const SearchBar = forwardRef<SearchBarHandle, SearchBarProps>(
  ({ onSearch, onNext, onPrev, matchIndex, matchCount }, ref) => {
    const [query, setQuery] = useState("");
    const [exact, setExact] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
      focusInput: () => {
        inputRef.current?.focus();
      },
    }));

    const handleSearch = () => {
      onSearch(query, exact);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSearch();
      }
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
          <input
            ref={inputRef}
            type="text"
            placeholder="🔍 Suche..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              padding: "4px 6px",
              borderRadius: "4px",
              border: "1px solid #ccc",
              fontSize: "0.95em",
              width: 120,
              minWidth: 0,
              height: 20,
            }}
          />
          <label style={{ fontSize: "0.95em" }}>
            <input
              type="checkbox"
              checked={exact}
              onChange={(e) => setExact(e.target.checked)}
              style={{ marginRight: 2 }}
            />
            Exakter Treffer
          </label>
          <MSquareButton onClick={handleSearch} width="60px" height="28px">
            Suchen
          </MSquareButton>
        </div>

        {matchCount > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <span style={{ fontSize: "0.92em" }}>
              {matchIndex + 1} von {matchCount} Treffern
            </span>
            <MSquareButton onClick={onPrev} width="28px" height="28px">
              <span style={{ fontSize: "16px" }}>▲</span>
            </MSquareButton>
            <MSquareButton onClick={onNext} width="28px" height="28px">
              <span style={{ fontSize: "16px" }}>▼</span>
            </MSquareButton>
          </div>
        )}
      </div>
    );
  }
);

export default SearchBar;
