import { useRef, useState, useEffect, createRef } from "react";
import { Rnd } from "react-rnd";
import { HotTableClass } from "@handsontable/react";
import type { HotStatus } from "./uiTableGrid/hotStatus";
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
import SheetCreateMenu from "./uiButtonFunctions/NewSheetCreateMenu";
import WelcomeScreen from "./WelcomeScreen";
import { clearEdits } from "../editierung/EditMap";
import type { Project } from "./SesionParameters";
import { createSheetApiCall } from "../utils/apiSync";
import StairHierarchyEditor from "../windows/StairHierarchyEditor";
import { softAktualisierenSheets } from "../../appButtonFunctions/SoftAktualisierenSheets";
import { initSSERefresh } from "../utils/sse";
import config from "../../../config.json";
import ExportExcelButton from "../../appButtonFunctions/ExportExcelButton";

import FunctionDock from "./uiSquares/FunctionDock";
import type {
  FunctionDockHandle,
  FocusableToolHandle,
} from "./uiSquares/FunctionDock";
import SquareQuickFilter from "./uiSquares/SquareQuickFilter";
import { applyQuickFilter } from "./uiButtonFormats/quickFilter";

const API_PREFIX = config.BACKEND_URL;
const ENABLE_WELCOME_SCREEN = true;

function App() {
  type SheetData = {
    headers: string[];
    data: (string | number)[][];
    layout: {
      columnWidths: Record<string, number>;
      rowHeights: Record<number, number>;
    };
  };

  const [selectedProject, setSelectedProject] = useState<Project | null>(
    ENABLE_WELCOME_SCREEN ? null : { id: 1, name: "Default" }
  );
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [sheets, setSheets] = useState<Record<string, SheetData>>({});
  const [activeSheet, setActiveSheet] = useState<string | null>(null);
  const [logs, setLogs] = useState<{ text: string; time: string }[]>([]);
  const [showHierarchy, setShowHierarchy] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{
    row: number;
    col: number;
  } | null>(null);
  const [showSheetMenu, setShowSheetMenu] = useState(false);
  const [baseViews, setBaseViews] = useState<{ id: number; name: string }[]>(
    []
  );
  // Per-Sheet-Status für Filter/Sort
  const [gridStatusBySheet, setGridStatusBySheet] = useState<
    Record<string, HotStatus>
  >({});

  const projectId = selectedProject?.id ?? undefined;

  const getStatus = (sheet?: string | null): HotStatus =>
    gridStatusBySheet[sheet ?? ""] ?? { isFiltered: false, isSorted: false };

  const updateStatus = (sheet: string, patch: Partial<HotStatus>) =>
    setGridStatusBySheet((prev) => ({
      ...prev,
      [sheet]: {
        ...(prev[sheet] ?? { isFiltered: false, isSorted: false }),
        ...patch,
      },
    }));

  const hotRefs = useRef<Record<string, React.RefObject<HotTableClass>>>({});

  const { moveRowsUp, moveRowsDown } = useRowMoverLogic(
    hotRefs.current[activeSheet ?? ""]?.current?.hotInstance ?? null
  );
  const { search, goNext, goPrev, matchIndex, matchCount } = useSearchFunctions(
    hotRefs.current[activeSheet ?? ""]?.current?.hotInstance ?? null
  );

  // --- Dock + QuickFilter verdrahtung ---
  const dockRef = useRef<FunctionDockHandle>(null);

  const applyQuickFilterForActiveSheet = (query: string, exact: boolean) => {
    const hot =
      hotRefs.current[activeSheet ?? ""]?.current?.hotInstance ?? null;
    if (!hot || !activeSheet) return;
    const col = selectedCell?.col ?? 0;
    applyQuickFilter(hot, col, query, exact);
  };

  const clearQuickFilterForActiveCol = () => {
    const hot =
      hotRefs.current[activeSheet ?? ""]?.current?.hotInstance ?? null;
    if (!hot || !activeSheet) return;
    const col = selectedCell?.col ?? 0;
    applyQuickFilter(hot, col, "", false);
  };

  const handleQuickFilterFocus = (col: number) => {
    setSelectedCell((prev) => ({ row: prev?.row ?? 0, col }));
    dockRef.current?.showQuickFilter();
    dockRef.current?.focus();
  };

  const handleSearchShortcut = () => {
    hotRefs.current[activeSheet ?? ""]?.current?.hotInstance?.deselectCell();
    dockRef.current?.showSearch();
    dockRef.current?.focus();
  };
  // --- Ende Dock-Block ---

  useEffect(() => {
    if (showSheetMenu) {
      fetch(
        `${API_PREFIX}/api/baseviews?project_id=${selectedProject?.id ?? 1}`
      )
        .then((res) => res.json())
        .then(setBaseViews)
        .catch(() => setBaseViews([]));
    }
  }, [showSheetMenu, selectedProject]);

  useEffect(() => {
    if (!projectId) return;
    const stop = initSSERefresh({
      projectId,
      apiPrefix: API_PREFIX,
      sheetNames,
      triggerLayoutCalculation, // bleibt im Call
      setSheets,
      hotRefs,
      clearEdits, // bleibt im Call
    });
    return stop;
  }, [
    projectId,
    sheetNames,
    setSheets,
    hotRefs, // ref-Objekt ist stabil; ok im Array, kann aber auch raus
  ]);

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
    if (!selectedProject) return;

    fetch(`${API_PREFIX}/api/last_insert_id?project_id=${selectedProject.id}`)
      .then((res) => res.json())
      .then((data) => {
        console.log("📥 Loaded last_insert_id from DB:", data.lastId);
        const last = data.lastId ?? -1;
        setInitialInsertedId(last);
      })
      .catch((err) => console.error("❌ Failed to fetch last_insert_id:", err));

    fetch(`${API_PREFIX}/api/sheetnames?project_id=${selectedProject.id}`)
      .then((res) => res.json())
      .then((names: string[]) => {
        setSheetNames(names);
        setActiveSheet(names[0] ?? null);

        return Promise.all(
          names.map((name) =>
            fetch(
              `${API_PREFIX}/api/tabledata?table=${name}&limit=700&project_id=${selectedProject.id}`
            )
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

  // Global Ctrl/Cmd+F -> Dock Search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        hotRefs.current[
          activeSheet ?? ""
        ]?.current?.hotInstance?.deselectCell();
        dockRef.current?.showSearch();
        dockRef.current?.focus();
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
    // sofort UI-State nur für aktives Sheet
    updateStatus(activeSheet, { isFiltered: false });
  };

  // --- Elektrik-Block-Flag (robust) ---
  const isElektrikActive =
    activeSheet?.toLowerCase().includes("elektrik") ?? false;
  const currentStatus = getStatus(activeSheet);
  const isBlocked = currentStatus.isFiltered || currentStatus.isSorted;

  // WelcomeScreen
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
      {/* --- Header + Buttons --- */}
      <div style={{ padding: "1rem", flexShrink: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
          <h3 style={{ margin: "0 0 0.25rem 0" }}>My-Ergonomic-Table</h3>
          {selectedProject && (
            <span style={{ fontWeight: 600, color: "#fff", fontSize: "1em" }}>
              Projekt: {selectedProject.name}
            </span>
          )}
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
                if (!selectedProject) return;
                await softAktualisierenSheets({
                  sheetNames,
                  apiPrefix: API_PREFIX,
                  projectId: selectedProject.id,
                  triggerLayoutCalculation,
                  setSheets,
                  hotRefs,
                  clearEdits,
                });
              } catch (err) {
                alert("Fehler beim Aktualisieren der Tabellen: " + err);
              }
            }}
          >
            🔄 Alle Tabellen aktualisieren
          </button>
        </div>

        <button
          onClick={() => setShowHierarchy(true)}
          style={{
            padding: "0.4rem 0.8rem",
            background: "#444",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          🧱 Hierarchie öffnen
        </button>

        {/* Einbauorte aktualisieren */}
        <button
          onClick={async () => {
            try {
              const res = await fetch(
                `${API_PREFIX}/api/rematerialize_einbauorte?project_id=${selectedProject?.id}`,
                { method: "POST" }
              );
              const data = await res.json();
              alert(`✅ ${data.count} Einbauorte aktualisiert`);
            } catch (e) {
              alert("❌ Fehler beim Einbauorte-Refresh: " + e);
            }
          }}
          style={{
            padding: "0.4rem 0.8rem",
            background: "#444",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontWeight: "bold",
            marginLeft: "0.5rem",
          }}
        >
          🔄 Materialized Einbauorte aktualisieren
        </button>

        {/* Weitere Buttons + Filterstatus */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            marginBottom: "0.5rem",
          }}
        >
          {selectedProject && activeSheet && (
            <ExportExcelButton
              apiPrefix={API_PREFIX}
              projectId={selectedProject.id}
              activeSheet={activeSheet}
              hotRefs={hotRefs}
            />
          )}

          <button
            onClick={async () => {
              try {
                const res = await fetch(
                  `${API_PREFIX}/api/rematerializeAll?project_id=${selectedProject?.id}`,
                  { method: "POST" }
                );
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
            key={`fs-${currentStatus.isFiltered ? 1 : 0}`}
            isFilterActive={currentStatus.isFiltered}
            onResetFilters={resetFilters}
          />

          <SquareMover
            selectedCell={selectedCell}
            dataLength={sheets[activeSheet].data.length}
            onMoveUp={moveRowsUp}
            onMoveDown={moveRowsDown}
            blocked={isElektrikActive}
          />

          {/* 🔁 Dynamischer Dock: Searchbar ODER QuickFilter */}
          <FunctionDock
            ref={dockRef}
            defaultMode="none"
            renderSearch={(ref) => (
              <SquareSearch
                ref={ref as unknown as React.Ref<SearchBarHandle>}
                onSearch={search}
                onNext={goNext}
                onPrev={goPrev}
                matchIndex={matchIndex}
                matchCount={matchCount}
              />
            )}
            renderQuickFilter={(ref) => (
              <SquareQuickFilter
                ref={ref as React.Ref<FocusableToolHandle>}
                header={sheets[activeSheet!]?.headers[selectedCell?.col ?? 0]}
                onApply={applyQuickFilterForActiveSheet}
                onClear={clearQuickFilterForActiveCol}
              />
            )}
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

        {/* Sheet Tabs */}
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            marginBottom: "4px",
            position: "relative",
          }}
        >
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
            onCreate={async (newTableName, baseViewId) => {
              setShowSheetMenu(false);
              if (!selectedProject?.id) {
                alert("Kein Projekt gewählt!");
                return;
              }
              const result = await createSheetApiCall({
                display_name: newTableName,
                base_view_id: baseViewId,
                project_id: selectedProject.id,
              });
              if (result.success) {
                if (result.last_id !== undefined) {
                  setInitialInsertedId(result.last_id);
                }
                fetch(
                  `${API_PREFIX}/api/sheetnames?project_id=${selectedProject.id}`
                )
                  .then((res) => res.json())
                  .then(async (names) => {
                    setSheetNames(names);
                    const newSheetName = names.length
                      ? names[names.length - 1]
                      : null;
                    setActiveSheet(newSheetName);
                    if (newSheetName) {
                      const tableRes = await fetch(
                        `${API_PREFIX}/api/tabledata?table=${newSheetName}&limit=700&project_id=${selectedProject.id}`
                      );
                      const { headers, data } = await tableRes.json();
                      triggerLayoutCalculation(headers, data, (layout) => {
                        setSheets((prev) => ({
                          ...prev,
                          [newSheetName]: { headers, data, layout },
                        }));
                      });
                    }
                  });
              } else {
                alert(result.error || "Sheet konnte nicht erstellt werden");
              }
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

        {/* --- Main Grid --- */}
        <Zoom>
          {(zoom, controls) => (
            <>
              <div
                style={{
                  height: "78vh",
                  width: "100%",
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                {sheetNames.map((name) => {
                  const sheet = sheets[name];
                  if (!sheet) return null;

                  return (
                    <div
                      key={name}
                      style={{
                        display: name === activeSheet ? "block" : "none",
                        height: "78vh",
                        width: "100%",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          transform: `scale(${zoom})`,
                          transformOrigin: "top left",
                          height: `${78 / zoom}vh`,
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
                          sheetName={name}
                          isBlocked={isBlocked}
                          selectedProject={selectedProject!}
                          // Status für dieses Sheet aktualisieren
                          onStatusChange={(s) =>
                            setGridStatusBySheet((prev) => ({
                              ...prev,
                              [name]: s,
                            }))
                          }
                          // 🔁 Dock-Steuerung aus dem Grid heraus
                          onQuickFilterFocus={handleQuickFilterFocus}
                          onSearchShortcut={handleSearchShortcut}
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

      {/* --- Hierarchy Rnd Window --- */}
      {showHierarchy && selectedProject && (
        <Rnd
          default={{
            x: window.innerWidth - 650,
            y: 100,
            width: 475,
            height: 500,
          }}
          bounds="window"
          minWidth={400}
          minHeight={300}
          dragHandleClassName="hierarchy-drag-handle"
          style={{
            zIndex: 999,
            background: "#1c1c1c",
            border: "1px solid #666",
            borderRadius: "8px",
            color: "#fff",
            padding: "1rem",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              height: "100%",
              minHeight: 0,
            }}
          >
            <div
              className="hierarchy-drag-handle"
              style={{
                cursor: "move",
                marginBottom: "0.5rem",
                flex: "0 0 auto",
              }}
            >
              <strong>🧱 Hierarchie</strong>
              <button
                onClick={() => setShowHierarchy(false)}
                style={{
                  float: "right",
                  color: "#fff",
                  background: "none",
                  border: "none",
                }}
              >
                ✖
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
              <StairHierarchyEditor
                projectId={selectedProject.id}
                apiPrefix={API_PREFIX}
              />
            </div>
          </div>
        </Rnd>
      )}
    </div>
  );
}

export default App;
