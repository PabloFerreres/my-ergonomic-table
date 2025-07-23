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
import { setInitialInsertedId } from "../utils/insertIdManager";
import { ConsolePanel } from "./uiSquares/ConsolePanel";
import { subscribeToConsole, unsubscribeFromConsole } from "../utils/uiConsole";
import SheetCreateMenu from "./uiButtonFunctions/SheetCreateMenu";
import WelcomeScreen from "./WelcomeScreen";
import { clearEdits } from "../editierung/EditMap";

import config from "../../../config.json";
const API_PREFIX = config.BACKEND_URL;

// <--- Toggle für WelcomeScreen
const ENABLE_WELCOME_SCREEN = false;
//TODO: Set this to get and set real project_id and maybe show preview of project information

function App() {
  type SheetData = {
    headers: string[];
    data: (string | number)[][];
    layout: {
      columnWidths: Record<string, number>;
      rowHeights: Record<number, number>;
    };
  };

  // WelcomeScreen-Logik
  const [selectedProject, setSelectedProject] = useState<string | null>(
    ENABLE_WELCOME_SCREEN ? null : "default"
  );

  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [sheets, setSheets] = useState<Record<string, SheetData>>({});
  const [activeSheet, setActiveSheet] = useState<string | null>(null);
  const [logs, setLogs] = useState<{ text: string; time: string }[]>([]);
  const [isFilterActive, setIsFilterActive] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{
    row: number;
    col: number;
  } | null>(null);

  const [showSheetMenu, setShowSheetMenu] = useState(false);
  const [baseViews, setBaseViews] = useState<{ id: number; name: string }[]>(
    []
  );

  const hotRefs = useRef<Record<string, React.RefObject<HotTableClass>>>({});

  const { moveRowsUp, moveRowsDown } = useRowMoverLogic(
    hotRefs.current[activeSheet ?? ""]?.current?.hotInstance ?? null
  );
  const { search, goNext, goPrev, matchIndex, matchCount } = useSearchFunctions(
    hotRefs.current[activeSheet ?? ""]?.current?.hotInstance ?? null
  );
  const searchBarRef = useRef<SearchBarHandle>(null);

  useEffect(() => {
    if (showSheetMenu) {
      fetch(`${API_PREFIX}/api/baseviews`)
        .then((res) => res.json())
        .then(setBaseViews)
        .catch(() => setBaseViews([]));
    }
  }, [showSheetMenu]);

  useEffect(() => {
    const handler = (entry: { text: string; time: string }) => {
      setLogs((prev) => [...prev, entry]);
    };
    subscribeToConsole(handler);
    return () => unsubscribeFromConsole(handler);
  }, []);

  useEffect(() => {
    const refs: Record<string, React.RefObject<HotTableClass>> = {};
    sheetNames.forEach((name) => {
      refs[name] = hotRefs.current[name] || createRef<HotTableClass>();
    });
    hotRefs.current = refs;
  }, [sheetNames]);

  useEffect(() => {
    // Sheets + DB nur nach Projektwahl laden!
    if (!selectedProject) return;

    fetch(`${API_PREFIX}/api/last_insert_id`)
      .then((res) => res.json())
      .then((data) => {
        console.log("📥 Loaded last_insert_id from DB:", data.lastId);
        const last = data.lastId ?? -1;
        setInitialInsertedId(last);
      })
      .catch((err) => console.error("❌ Failed to fetch last_insert_id:", err));

    fetch(`${API_PREFIX}/api/sheetnames`)
      .then((res) => res.json())
      .then((names: string[]) => {
        setSheetNames(names);
        setActiveSheet(names[0] ?? null);

        return Promise.all(
          names.map((name) =>
            fetch(`${API_PREFIX}/api/tabledata?table=${name}&limit=700`)
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
  }, [selectedProject]);

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

  // WelcomeScreen anzeigen, falls aktiviert und kein Projekt gewählt
  if (ENABLE_WELCOME_SCREEN && !selectedProject) {
    return <WelcomeScreen onSelect={setSelectedProject} />;
  }

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
        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
          <h3 style={{ margin: "0 0 0.25rem 0" }}>My-Ergonomic-Table</h3>
          <button
            style={{
              padding: "0.4rem 0.8rem",
              background: "#2170c4",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: "bold",
            }}
            title="Alle geladenen Sheets neu laden"
            onClick={async () => {
              try {
                const results = await Promise.all(
                  sheetNames.map(async (name) => {
                    const res = await fetch(
                      `${API_PREFIX}/api/tabledata?table=${name}&limit=700`
                    );
                    const { headers, data } = await res.json();
                    return new Promise<{
                      name: string;
                      headers: string[];
                      data: (string | number)[][];
                      layout: SheetData["layout"];
                    }>((resolve) =>
                      triggerLayoutCalculation(headers, data, (layout) =>
                        resolve({ name, headers, data, layout })
                      )
                    );
                  })
                );
                const loadedSheets: Record<string, SheetData> = {};
                results.forEach(({ name, headers, data, layout }) => {
                  loadedSheets[name] = { headers, data, layout };
                });
                setSheets(loadedSheets);

                clearEdits(); // <<< ALLE Edits und gelbe Zellen zurücksetzen
              } catch (err) {
                alert("Fehler beim Aktualisieren der Tabellen: " + err);
              }
            }}
          >
            🔄 Alle Tabellen aktualisieren
          </button>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            marginBottom: "0.5rem",
          }}
        >
          <button
            onClick={async () => {
              try {
                const res = await fetch(`${API_PREFIX}/api/elektrik_update`, {
                  method: "POST",
                });
                const data = await res.json();
                alert("Elektrik-Liste wurde aktualisiert!\nIDs: " + data.count);
              } catch (e) {
                alert("Fehler beim Elektrik-Update: " + e);
              }
            }}
          >
            Elektrik-Liste aktualisieren
          </button>

          <button
            onClick={async () => {
              try {
                const res = await fetch(`${API_PREFIX}/api/rematerializeAll`, {
                  method: "POST",
                });
                if (!res.ok) throw new Error(`Server error ${res.status}`);
                const result = await res.json();
                console.log("🔁 + ⚡️ All rematerialized:", result);
                if (result.log) {
                  const now = new Date().toLocaleTimeString();
                  setLogs((prev) => [...prev, { text: result.log, time: now }]);
                }
              } catch (err) {
                const errorMsg = "❌ Rematerialize all failed: " + String(err);
                console.error(errorMsg);
                const now = new Date().toLocaleTimeString();
                setLogs((prev) => [...prev, { text: errorMsg, time: now }]);
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

          <div
            style={{
              position: "absolute",
              top: "1rem",
              right: "1rem",
              zIndex: 10,
            }}
          >
            <ConsolePanel logs={logs} />
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            marginBottom: "4px",
            position: "relative",
          }}
        >
          {/* Plus-Button ganz links */}
          <button
            style={{
              padding: "0.4rem 0.8rem",
              background: "#222",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: "bold",
            }}
            title="Neues Sheet anlegen"
            onClick={() => setShowSheetMenu(true)}
          >
            +
          </button>

          <SheetCreateMenu
            open={showSheetMenu}
            baseViews={baseViews}
            onCreate={(newTableName, baseViewId) => {
              setShowSheetMenu(false);
            }}
            onClose={() => setShowSheetMenu(false)}
          />

          {sheetNames.map((name) => {
            let cleanName = name;
            if (name.startsWith("materialized_")) {
              cleanName = name.slice("materialized_".length);
            }
            if (cleanName.includes("_")) {
              cleanName = cleanName.substring(0, cleanName.lastIndexOf("_"));
            }
            return (
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
                {cleanName}
              </button>
            );
          })}
        </div>

        <Zoom>
          {(zoom, controls) => (
            <>
              <div
                style={{
                  height: "80.5vh",
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
                        height: "80.5vh",
                        width: "100%",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          transform: `scale(${zoom})`,
                          transformOrigin: "top left",
                          height: `${80.5 / zoom}vh`,
                          width: `${100 / zoom}%`,
                          overflow: "hidden",
                        }}
                      >
                        <TableGrid
                          onSelectionChange={setSelectedCell}
                          data={sheet.data}
                          colHeaders={sheet.headers}
                          hotRef={hotRefs.current[name]}
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
