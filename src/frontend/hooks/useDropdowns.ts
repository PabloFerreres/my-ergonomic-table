import { useCallback, useEffect, useMemo, useState } from "react";
import Handsontable from "handsontable";
import { buildColumnDefs } from "../visualization/uiTableGrid/TableGridConsts";
import config from "../../../config.json";

export type DropdownMap = Record<string, string[]>;

/** lädt Dropdown-Inhalte für die übergebenen Header-Namen (display names) */
export function useDropdownOptions(projectId: number, headers: string[]) {
  const [dropdowns, setDropdowns] = useState<DropdownMap>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const load = useCallback(async () => {
    if (!headers || headers.length === 0) {
      setDropdowns({});
      return;
    }
    setLoading(true);
    setError(null);
    const ac = new AbortController();
    try {
      const params = new URLSearchParams();
      params.set("project_id", String(projectId));
      headers.forEach(h => params.append("header", h));
      const res = await fetch(`${config.BACKEND_URL}/api/dropdownOptionsByHeaders?${params.toString()}`, { signal: ac.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const resp = (await res.json()) as DropdownMap;
      console.debug("[dropdowns/raw]", resp);
      // Mappe Response eindeutig auf die *übergebenen* Header
      const norm: DropdownMap = {};
      headers.forEach(h => {
        const cands = [h, h.trim(), h.toLowerCase(), h.trim().toLowerCase()];
        const key = cands.find(k => k in resp);
        norm[h] = key ? resp[key]! : [];
      });
      console.debug("[dropdowns/norm]", norm);
      setDropdowns(norm);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e);
      setDropdowns({});
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
    return () => ac.abort();
  }, [projectId, headers]);

  useEffect(() => { load(); }, [load, reloadTick]);

  const reload = useCallback(() => setReloadTick(t => t + 1), []);

  return { dropdowns, loading, error, reload };
}

/** mischt Dropdown-Quellen in die HOT-Spalten-Defs */
export function useDropdownColumns(colHeaders: string[], dropdowns: DropdownMap) {
  return useMemo<Handsontable.ColumnSettings[]>(() => {
    const base = buildColumnDefs(colHeaders);
    return base.map((def, idx) => {
      const header = colHeaders[idx];
      const source = dropdowns?.[header];
      if (Array.isArray(source)) {
        const col: Handsontable.ColumnSettings = {
          ...def,
          type: "dropdown",
          editor: "dropdown",
          source,
          strict: true,
          allowInvalid: true,
        };
        return col;
      }
      return def as Handsontable.ColumnSettings;
    });
  }, [colHeaders, dropdowns]);
}
