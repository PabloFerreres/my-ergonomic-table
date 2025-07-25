import type { EditEntry } from "../editierung/EditMap";
import { getLastUsedInsertedId } from "../editierung/EditMap";
import { uiConsole } from "../utils/uiConsole";
import config from '../../../config.json'; // Pfad ggf. anpassen!

const API_PREFIX = config.BACKEND_URL;

export async function sendEdits(sheet: string, edits: EditEntry[], project_id: number) {
  try {
    const payload = {
      edits,
      lastUsedInsertedId: getLastUsedInsertedId(),
    };

    const res = await fetch(`${API_PREFIX}/api/updateEdits?project_id=${project_id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(`Server error`);
    const result = await res.json();
    const msg = result.log || `✅ Edits gespeichert (${result.count}) für Sheet: ${sheet}`;
    uiConsole(msg);
  } catch (err) {
    console.error("❌ Failed to sync edits:", err);
  }
}

export async function sendPositionMap(
  sheet: string,
  rows: { project_article_id: string | number; position: number }[],
  project_id: number
) {
  try {
    const payload = [{ sheet, rows }];
    const res = await fetch(`${API_PREFIX}/api/updatePosition?project_id=${project_id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Server error");
    console.log("✅ PositionMap sent");
  } catch (err) {
    console.error("❌ Failed to sync positionMap:", err);
  }
}

// ---- NEU: Sheet anlegen API ----

/**
 * Legt ein neues Sheet an (inkl. Materialized etc.)
 * @returns { success: boolean, view_id?: number, sheet_name?: string, error?: string }
 */
export async function createSheetApiCall({
  display_name,
  base_view_id,
  project_id,
}: {
  display_name: string;
  base_view_id: number | string;
  project_id: number | string;
}) {
  try {
    const res = await fetch(`${API_PREFIX}/api/views/create_sheet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name,
        base_view_id,
        project_id,
      }),
    });
    if (!res.ok) throw new Error("Server error");
    return await res.json();
  } catch (err) {
    return { success: false, error: String(err) };
  }
}


// utils/apiSync.ts

export async function fetchNextInsertedId() {
  const res = await fetch(`${API_PREFIX}/api/next_inserted_id`);
  const data = await res.json();
  if (!("next_id" in data)) throw new Error("No next_id from backend");
  return data.next_id;
}
