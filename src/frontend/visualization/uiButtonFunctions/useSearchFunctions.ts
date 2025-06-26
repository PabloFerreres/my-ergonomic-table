// src/frontend/visualization/uiButtonFunctions/useSearchFunctions.ts
import { useRef, useState } from "react";
import type Handsontable from "handsontable";

export function useSearchFunctions(hot: Handsontable | null) {
  const matchesRef = useRef<[number, number][]>([]);
  const [matchIndex, setMatchIndex] = useState<number>(0);

  const search = (query: string, exactMatch: boolean) => {
    if (!hot) return;

    matchesRef.current = [];
    hot.deselectCell();

    const q = query.toLowerCase();

    hot.getData().forEach((row, rowIndex) => {
      row.forEach((cell: string | number, colIndex: number) => {

        const value = String(cell ?? "").toLowerCase();
        const match = exactMatch ? value === q : value.includes(q);

        if (match) {
          matchesRef.current.push([rowIndex, colIndex]);
        }
      });
    });

    if (matchesRef.current.length > 0) {
      setMatchIndex(0);
      const [r, c] = matchesRef.current[0];
      hot.selectCell(r, c);
    } else {
      setMatchIndex(0);
      alert("🔍 Kein Treffer gefunden");
    }
  };

  const goToMatch = (index: number) => {
    if (!hot || matchesRef.current.length === 0) return;
    const [r, c] = matchesRef.current[index];
    hot.selectCell(r, c);
  };

  const goNext = () => {
    if (matchesRef.current.length === 0) return;
    setMatchIndex((prev) => {
      const next = (prev + 1) % matchesRef.current.length;
      goToMatch(next);
      return next;
    });
  };

  const goPrev = () => {
    if (matchesRef.current.length === 0) return;
    setMatchIndex((prev) => {
      const next = (prev - 1 + matchesRef.current.length) % matchesRef.current.length;
      goToMatch(next);
      return next;
    });
  };

  return {
    search,
    goNext,
    goPrev,
    matchIndex,
    matchCount: matchesRef.current.length,
  };
}
