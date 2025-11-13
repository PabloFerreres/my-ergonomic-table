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
import { deleteSheetApiCall } from "../utils/apiSync";
import { setHeaderRowsBySheet } from "../utils/apiSync";
import {
  getHeaderRows,
  isPending,
  markPending,
  clearPending,
  subscribe,
} from "../utils/HeaderRowsStore";

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
  const [viewIdBySheet, setViewIdBySheet] = useState<Record<string, number>>(
    {}
  );

  const projectId = selectedProject?.id ?? undefined;

  const [tabMenu, setTabMenu] = useState<null | {
    x: number;
    y: number;
    sheet: string;
  }>(null);

  const reloadSheetNames = async () => {
    if (!selectedProject?.id) return;
    const res = await fetch(
      `${API_PREFIX}/api/sheetnames?project_id=${selectedProject.id}`
    );
    const names: string[] = await res.json();
    setSheetNames(names);
    if (names.length && !names.includes(activeSheet ?? "")) {
      setActiveSheet(names[0]);
    }
  };

  // robustes Laden mit kleinem Retry (3x)
  const fetchTableDataWithRetry = async (
    table: string,
    projectId: number,
    tries = 3,
    delayMs = 250
  ) => {
    for (let i = 0; i < tries; i++) {
      const res = await fetch(
        `${API_PREFIX}/api/tabledata?table=${table}&limit=700&project_id=${projectId}`
      );
      if (res.ok) return res.json();
      await new Promise((r) => setTimeout(r, delayMs));
    }
    // letzter Versuch: Fehler werfen (wird oben gefangen)
    const res = await fetch(
      `${API_PREFIX}/api/tabledata?table=${table}&limit=700&project_id=${projectId}`
    );
    if (!res.ok) throw new Error(`tabledata failed: HTTP ${res.status}`);
    return res.json();
  };

  const loadSheetAndActivate = async (table: string, projectId: number) => {
    setActiveSheet(table); // sofort aktivieren (UI)
    const { headers, data } = await fetchTableDataWithRetry(table, projectId);
    await new Promise<void>((resolve) => {
      triggerLayoutCalculation(headers, data, (layout) => {
        setSheets((prev) => ({ ...prev, [table]: { headers, data, layout } }));
        resolve();
      });
    });
  };

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
    // Fetch sheet names
    fetch(`${API_PREFIX}/api/sheetnames?project_id=${selectedProject.id}`)
      .then((res) => res.json())
      .then((names: string[]) => {
        setSheetNames(names);
        setActiveSheet(names[0] ?? null);
        // Fetch all views for mapping
        fetch(`${API_PREFIX}/api/views?project_id=${selectedProject.id}`)
          .then((res) => res.json())
          .then((views: { id: number; name: string }[]) => {
            // Build mapping: use views.name directly (middle part)
            const map: Record<string, number> = {};
            views.forEach((v) => {
              map[v.name] = v.id;
            });
            setViewIdBySheet(map);
          })
          .catch(() => setViewIdBySheet({}));
        // ...existing code for loading sheets...
        return Promise.all(
          names.map((name) =>
            fetch(
              `${API_PREFIX}/api/tabledata?table=${name}&limit=700&project_id=${selectedProject.id}`
            )
              .then((res) => res.json())
              .then((result) => {
                if (result.error) {
                  console.error(
                    `Failed to load table '${name}': ${result.error}`
                  );
                  // Optionally, show a user notification here
                  // Return empty sheet to avoid crash
                  return {
                    name,
                    headers: [],
                    data: [],
                    layout: { columnWidths: {}, rowHeights: {} },
                  };
                }
                const { headers, data } = result;
                return new Promise<{
                  name: string;
                  headers: string[];
                  data: (string | number)[][];
                  layout: SheetData["layout"];
                }>((resolve) => {
                  triggerLayoutCalculation(headers, data, (layout) => {
                    resolve({ name, headers, data, layout });
                  });
                });
              })
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

  function HeaderRowsToggleRow({
    sheet,
    projectId,
  }: {
    sheet: string;
    projectId?: number;
  }) {
    const sheetKey = sheet.toLowerCase();
    const [, force] = useState(0);

    useEffect(() => {
      const unsubscribe = subscribe(() => force((x) => x + 1));
      return () => {
        unsubscribe();
      };
    }, []);

    const enabled = getHeaderRows(sheetKey);
    const pending = isPending(sheetKey);

    // ✦ NEU: robustes Erkennen von Elektrik-Sheets (namensbasiert, minimal-invasiv)
    const isElektrikSheet = /(^|_)elektrik(_|$)/.test(sheetKey);

    const onToggle = async () => {
      if (!projectId || pending) return;

      // ✦ NEU: Block – in Elektrik darf man Header nicht ausschalten
      if (isElektrikSheet && enabled) {
        // optional: kurzer Hinweis; wenn du es ganz still willst, Zeile entfernen
        console.info(
          "Elektrik-Sheet: Header sind fixiert (können nicht deaktiviert werden)."
        );
        return;
      }

      const next = !enabled;
      markPending(sheetKey);
      try {
        await setHeaderRowsBySheet(projectId, sheetKey, next);
        // finaler Zustand kommt über SSE -> Store
      } catch (e) {
        clearPending(sheetKey);
        alert("Toggle fehlgeschlagen: " + String(e));
      }
    };

    const isBlockedNow = isElektrikSheet && enabled;

    return (
      <div
        style={{
          padding: "8px 12px",
          cursor: pending ? "wait" : isBlockedNow ? "not-allowed" : "pointer",
          opacity: pending || isBlockedNow ? 0.6 : 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
        onClick={onToggle}
        title={
          pending
            ? "Wird angewendet…"
            : isBlockedNow
            ? "Elektrik: Header-Zeilen sind fixiert"
            : enabled
            ? "Header-Zeilen deaktivieren"
            : "Header-Zeilen aktivieren"
        }
      >
        <span>Header-Zeilen{isElektrikSheet ? " (Elektrik)" : ""}</span>
        <div
          style={{
            width: 42,
            height: 22,
            borderRadius: 999,
            background: enabled ? "#4ade80" : "#e5e7eb",
            position: "relative",
            boxShadow: "inset 0 0 0 1px rgba(0,0,0,.1)",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 2,
              left: enabled ? 22 : 2,
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: "#fff",
              boxShadow: "0 1px 3px rgba(0,0,0,.35)",
              transition: "left .2s",
            }}
          />
        </div>
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

          <button
            onClick={async () => {
              if (!selectedProject || !activeSheet) {
                alert("Kein Projekt oder Sheet gewählt!");
                return;
              }
              // Extract middle part for mapping
              let sheetKey = activeSheet;
              if (sheetKey.startsWith("materialized_")) {
                sheetKey = sheetKey.slice("materialized_".length);
              }
              if (sheetKey.includes("_")) {
                sheetKey = sheetKey.substring(0, sheetKey.lastIndexOf("_"));
              }
              const viewId = viewIdBySheet[sheetKey];
              console.log("[Sync] activeSheet:", activeSheet);
              console.log("[Sync] sheetKey:", sheetKey);
              console.log("[Sync] viewIdBySheet:", viewIdBySheet);
              console.log("[Sync] resolved viewId:", viewId);
              if (!viewId) {
                alert("view_id für aktives Sheet nicht gefunden!");
                return;
              }
              try {
                // Step 2: Trigger sync workflow
                const payload = {
                  project_id: selectedProject.id,
                  view_id: viewId,
                };
                console.log("[Sync] Sending payload:", payload);
                const syncRes = await fetch(`${API_PREFIX}/api/sync_to_cad`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload),
                });
                const raw = await syncRes.clone().text();
                console.log("[Sync] Raw response:", raw);
                if (!syncRes.ok)
                  throw new Error(`Sync-Fehler: ${syncRes.status}`);
                const syncResult = await syncRes.json();
                console.log("[Sync] Parsed response:", syncResult);
                const now = new Date().toLocaleTimeString();
                setLogs((prev) => [
                  ...prev,
                  {
                    text: `✅ Sync erfolgreich für view_id ${viewId}: ${
                      syncResult.log || "OK"
                    }`,
                    time: now,
                  },
                ]);
                alert(`✅ Sync erfolgreich für view_id ${viewId}`);

                // Step 2: Rematerialize all
                const rematRes = await fetch(
                  `${API_PREFIX}/api/rematerializeAll?project_id=${selectedProject.id}`,
                  { method: "POST" }
                );
                if (!rematRes.ok)
                  throw new Error(`Rematerialize-Fehler: ${rematRes.status}`);
                const rematResult = await rematRes.json();
                console.log("[Sync] Rematerialize result:", rematResult);
                setLogs((prev) => [
                  ...prev,
                  {
                    text: `⚡️ Rematerialize erfolgreich: ${
                      rematResult.log || "OK"
                    }`,
                    time: new Date().toLocaleTimeString(),
                  },
                ]);
              } catch (err) {
                const errorMsg =
                  "❌ Advanced Sync fehlgeschlagen: " + String(err);
                const now = new Date().toLocaleTimeString();
                setLogs((prev) => [...prev, { text: errorMsg, time: now }]);
                alert(errorMsg);
              }
            }}
            style={{
              padding: "0.4rem 0.8rem",
              background: "#2170c4",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: "bold",
              marginLeft: "0.5rem",
            }}
            title="Erweiterte Sync-Einstellungen: CAD-Daten synchronisieren (direkt mit view_id)"
          >
            Sync With CAD (View)
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
              try {
                const result = await createSheetApiCall({
                  display_name: newTableName,
                  base_view_id: baseViewId,
                  project_id: selectedProject.id,
                });

                if (!result.success) {
                  alert(result.error || "Sheet konnte nicht erstellt werden");
                  return;
                }

                if (result.last_id !== undefined)
                  setInitialInsertedId(result.last_id);

                // Liste neu laden
                const res = await fetch(
                  `${API_PREFIX}/api/sheetnames?project_id=${selectedProject.id}`
                );
                const names: string[] = await res.json();
                setSheetNames(names);

                // Ziel: exakt der vom Server zurückgegebene sheet_name
                const target =
                  result.sheet_name && names.includes(result.sheet_name)
                    ? result.sheet_name
                    : names[0] ?? null;

                if (!target) {
                  alert("Neues Sheet wurde nicht gefunden.");
                  return;
                }

                // Daten für neues Sheet robust laden
                await loadSheetAndActivate(target, selectedProject.id);
              } catch (err) {
                console.error(err);
                alert(
                  "Fehler beim Erstellen/Laden des neuen Sheets: " + String(err)
                );
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
                onContextMenu={(e) => {
                  e.preventDefault();
                  setTabMenu({ x: e.clientX, y: e.clientY, sheet: name });
                }}
                style={{
                  padding: "0.4rem 0.8rem",
                  background: activeSheet === name ? "#555" : "#222",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
                title={cleanName}
              >
                {cleanName}
              </button>
            );
          })}

          {/* Kontext-Menü (fix positioniert) */}
          {tabMenu && (
            <div
              style={{
                position: "fixed",
                left: tabMenu.x,
                top: tabMenu.y,
                background: "#1f1f1f",
                color: "#fff",
                border: "1px solid #444",
                borderRadius: 6,
                boxShadow: "0 6px 24px rgba(0,0,0,0.4)",
                zIndex: 9999,
                minWidth: 200,
                userSelect: "none",
                padding: 4,
              }}
              onMouseLeave={() => setTabMenu(null)}
            >
              {/* Header Rows Toggle */}
              <HeaderRowsToggleRow
                sheet={tabMenu.sheet}
                projectId={selectedProject?.id}
              />

              {/* Divider */}
              <div
                style={{
                  height: 1,
                  background: "#333",
                  margin: "6px 8px",
                }}
              />

              {/* Delete */}
              <div
                style={{ padding: "8px 12px", cursor: "pointer" }}
                onClick={async () => {
                  if (!selectedProject?.id) {
                    setTabMenu(null);
                    return;
                  }
                  if (!window.confirm("Sheet wirklich löschen?")) {
                    setTabMenu(null);
                    return;
                  }

                  const res = await deleteSheetApiCall(
                    selectedProject.id,
                    tabMenu.sheet
                  );
                  if (!res?.success) {
                    alert(res?.error || "Delete fehlgeschlagen");
                    setTabMenu(null);
                    return;
                  }

                  // lokalen Cache säubern
                  setSheets((prev) => {
                    const copy = { ...prev };
                    delete copy[tabMenu.sheet];
                    return copy;
                  });

                  await reloadSheetNames();
                  setTabMenu(null);
                }}
              >
                Delete
              </div>

              {/* Rename – Platzhalter */}
              <div
                style={{
                  padding: "8px 12px",
                  cursor: "not-allowed",
                  opacity: 0.5,
                }}
                title="Rename kommt später"
                onClick={() => setTabMenu(null)}
              >
                Rename
              </div>
            </div>
          )}
        </div>{" "}
        {/* ← Tabs-Container sauber schließen */}
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
