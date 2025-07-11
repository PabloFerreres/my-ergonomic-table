import { useRef, useState, useEffect, createRef } from "react";
import { HotTableClass } from "@handsontable/react";
import TableGrid from "./TableGrid";
import Zoom from "./uiButtonFunctions/Zoom";
import { triggerLayoutCalculation } from "./uiButtonFunctions/TriggerLayoutCalculation";
import { useRowMoverLogic } from "../hooks/useRowMoverLogic";
import FilterStatus from "./uiButtonFunctions/FilterStatus";
import type { SearchBarHandle } from "./uiButtonFormats/SearchBar";
import { useSearchFunctions } from "./uiButtonFunctions/useSearchFunctions";
import "./App.css";
import SquareMover from "./uiSquares/SquareMover";
import SquareSearch from "./uiSquares/SquareSearch";
import { getEdits } from "../editierung/EditMap";
import { setInitialInsertedId } from "../utils/insertIdManager";

function App() {
  type SheetData = {
    headers: string[];
    data: (string | number)[][];
    layout: {
      columnWidths: Record<string, number>;
      rowHeights: Record<number, number>;
    };
  };

  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [sheets, setSheets] = useState<Record<string, SheetData>>({});
  const [activeSheet, setActiveSheet] = useState<string | null>(null);

  const hotRefs = useRef<Record<string, React.RefObject<HotTableClass>>>({});

  const [selectedCell, setSelectedCell] = useState<{
    row: number;
    col: number;
  } | null>(null);
  const [isFilterActive, setIsFilterActive] = useState(false);

  useEffect(() => {
    const refs: Record<string, React.RefObject<HotTableClass>> = {};
    sheetNames.forEach((name) => {
      refs[name] = hotRefs.current[name] || createRef<HotTableClass>();
    });
    hotRefs.current = refs;
  }, [sheetNames]);

  const { moveRowsUp, moveRowsDown } = useRowMoverLogic(
    hotRefs.current[activeSheet ?? ""]?.current?.hotInstance ?? null
  );
  const { search, goNext, goPrev, matchIndex, matchCount } = useSearchFunctions(
    hotRefs.current[activeSheet ?? ""]?.current?.hotInstance ?? null
  );
  const searchBarRef = useRef<SearchBarHandle>(null);

  useEffect(() => {
    // 🔽 Lade initialen last_insert_id von der DB
    fetch("http://localhost:8000/api/last_insert_id?project_id=1")
      .then((res) => res.json())
      .then((data) => {
        console.log("📥 Loaded last_insert_id from DB:", data.lastId);
        const last = data.lastId ?? -1;
        setInitialInsertedId(last);
      })
      .catch((err) => console.error("❌ Failed to fetch last_insert_id:", err));

    // 🔽 Lade Sheets wie bisher
    fetch("http://localhost:8000/api/sheetnames")
      .then((res) => res.json())
      .then((names: string[]) => {
        setSheetNames(names);
        setActiveSheet(names[0] ?? null);

        return Promise.all(
          names.map((name) =>
            fetch(`http://localhost:8000/api/tabledata?table=${name}&limit=700`)
              .then((res) => res.json())
              .then(
                ({ headers, data }) =>
                  new Promise<{
                    name: string;
                    headers: string[];
                    data: (string | number)[][];
                    layout: SheetData["layout"];
                  }>((resolve) => {
                    triggerLayoutCalculation(headers, data, (layout) => {
                      resolve({ name, headers, data, layout });
                    });
                  })
              )
          )
        );
      })
      .then((results) => {
        const loadedSheets: Record<string, SheetData> = {};
        results.forEach(({ name, headers, data, layout }) => {
          loadedSheets[name] = { headers, data, layout };
        });
        setSheets(loadedSheets);
      })
      .catch((err) => console.error("Failed to load sheets", err));
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        hotRefs.current[
          activeSheet ?? ""
        ]?.current?.hotInstance?.deselectCell();
        searchBarRef.current?.focusInput();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeSheet]);

  const resetFilters = () => {
    const hotInstance =
      hotRefs.current[activeSheet ?? ""]?.current?.hotInstance;
    if (!hotInstance || !activeSheet) return;
    const filtersPlugin = hotInstance.getPlugin("filters");
    sheets[activeSheet].headers.forEach((_, idx) => {
      filtersPlugin.removeConditions(idx);
    });
    filtersPlugin.filter();
    setIsFilterActive(false);
  };

  if (!activeSheet || !sheets[activeSheet]) {
    return (
      <div style={{ padding: "2rem", fontSize: "1.2rem" }}>
        ⏳ Lade Tabellen...
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        backgroundImage: 'url("/1234.png")',
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
        backgroundRepeat: "no-repeat",
        color: "#f0e9dc",
        position: "relative",
      }}
    >
      <div style={{ padding: "1rem", flexShrink: 0, overflow: "hidden" }}>
        <h3 style={{ margin: "0 0 0.25rem 0" }}>My-Ergonomic-Table</h3>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            marginBottom: "0.5rem",
          }}
        >
          <button onClick={() => console.log("editMap:", getEdits())}>
            Log EditMap
          </button>

          <button
            onClick={async () => {
              try {
                const res = await fetch(
                  `http://localhost:8000/api/rematerializeAll`,
                  {
                    method: "POST",
                  }
                );
                if (!res.ok) throw new Error(`Server error ${res.status}`);
                const result = await res.json();
                console.log("🔁 All rematerialized:", result);
              } catch (err) {
                console.error("❌ Rematerialize all failed:", err);
              }
            }}
          >
            Rematerialize All
          </button>

          <FilterStatus
            isFilterActive={isFilterActive}
            onResetFilters={resetFilters}
          />
          <SquareMover
            selectedCell={selectedCell}
            dataLength={sheets[activeSheet].data.length}
            onMoveUp={moveRowsUp}
            onMoveDown={moveRowsDown}
          />
          <SquareSearch
            ref={searchBarRef}
            onSearch={search}
            onNext={goNext}
            onPrev={goPrev}
            matchIndex={matchIndex}
            matchCount={matchCount}
          />
          <button
            onClick={() => {
              triggerLayoutCalculation(
                sheets[activeSheet].headers,
                sheets[activeSheet].data,
                (layout) => {
                  setSheets((prev) => ({
                    ...prev,
                    [activeSheet]: {
                      ...prev[activeSheet],
                      layout,
                    },
                  }));
                }
              );
            }}
          >
            🔁 Recalculate Layout
          </button>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "4px" }}>
          {sheetNames.map((name) => (
            <button
              key={name}
              onClick={() => setActiveSheet(name)}
              style={{
                padding: "0.4rem 0.8rem",
                background: activeSheet === name ? "#555" : "#222",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              {name}
            </button>
          ))}
        </div>

        <Zoom>
          {(zoom, controls) => (
            <>
              <div
                style={{
                  height: "78.5vh",
                  width: "100%",
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                {sheetNames.map((name) => {
                  const sheet = sheets[name];
                  if (!sheet) return null;

                  const hot = hotRefs.current[name]?.current?.hotInstance;
                  const filters =
                    hot?.getPlugin("filters")?.exportConditions?.() ?? [];
                  const isFiltered = (
                    filters as { column: number; conditions: unknown[] }[]
                  ).some((c) => c.conditions && c.conditions.length > 0);
                  const sort =
                    hot?.getPlugin("columnSorting")?.getSortConfig() ?? [];
                  const isSorted = Array.isArray(sort) && sort.length > 0;
                  const isBlocked = isFiltered || isSorted;

                  return (
                    <div
                      key={name}
                      style={{
                        display: name === activeSheet ? "block" : "none",
                        height: "78.5vh",
                        width: "100%",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          transform: `scale(${zoom})`,
                          transformOrigin: "top left",
                          height: `${78.5 / zoom}vh`,
                          width: `${100 / zoom}%`,
                          overflow: "hidden",
                        }}
                      >
                        <TableGrid
                          data={sheet.data}
                          colHeaders={sheet.headers}
                          hotRef={hotRefs.current[name]}
                          afterSelection={(row, col) =>
                            setSelectedCell({ row, col })
                          }
                          rowHeights={Object.values(sheet.layout.rowHeights)}
                          colWidths={sheet.headers.map(
                            (h) => sheet.layout.columnWidths[h] ?? undefined
                          )}
                          afterFilter={setIsFilterActive}
                          sheetName={name}
                          isBlocked={isBlocked}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div
                style={{
                  padding: "4px",
                  display: "flex",
                  justifyContent: "flex-end",
                }}
              >
                {controls}
              </div>
            </>
          )}
        </Zoom>
      </div>
    </div>
  );
}

export default App;
