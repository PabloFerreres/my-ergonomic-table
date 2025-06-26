import { forwardRef, useImperativeHandle, useRef } from "react";
import SearchBar from "../uiButtonFormats/SearchBar";
import type { SearchBarHandle } from "../uiButtonFormats/SearchBar";
import MSquareContainer from "../uiSquares/MSquareContainer";

interface SquareSearchProps {
  onSearch: (query: string, exactMatch: boolean) => void;
  onNext: () => void;
  onPrev: () => void;
  matchIndex: number;
  matchCount: number;
}

const SquareSearch = forwardRef<SearchBarHandle, SquareSearchProps>(
  ({ onSearch, onNext, onPrev, matchIndex, matchCount }, ref) => {
    const searchBarRef = useRef<SearchBarHandle>(null);

    useImperativeHandle(ref, () => ({
      focusInput: () => {
        searchBarRef.current?.focusInput();
      },
    }));

    return (
      <MSquareContainer width="360px" height="60px">
        <SearchBar
          ref={searchBarRef}
          onSearch={onSearch}
          onNext={onNext}
          onPrev={onPrev}
          matchIndex={matchIndex}
          matchCount={matchCount}
        />
      </MSquareContainer>
    );
  }
);

export default SquareSearch;
