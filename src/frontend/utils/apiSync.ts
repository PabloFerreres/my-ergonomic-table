import type { EditEntry } from "../editierung/EditMap";
import { getLastUsedInsertedId } from "../editierung/EditMap";
import { uiConsole } from "../utils/uiConsole";
import config from "../../../config.json";

const API_PREFIX = config.BACKEND_URL;

export async function fetchDropdownOptions(
  projectId: number,
  baseViewId: number
): Promise<Record<string, string[]>> {
  const res = await fetch(
    `/api/dropdownOptions?project_id=${projectId}&base_view_id=${baseViewId}`
  );
  if (!res.ok) return {};
  return res.json();
}

export async function sendEdits(
  sheet: string,
  edits: EditEntry[],
  project_id: number
) {
  try {
    if (!edits || edits.length === 0) {
      return { status: "ok", count: 0, log: "⚪️ keine Edits" };
    }

    const payload = {
      sheet, // <<< wichtig für Backend-Entscheidung (SSE/Remat)
      edits,
      lastUsedInsertedId: getLastUsedInsertedId(),
    };

    const res = await fetch(
      `${API_PREFIX}/api/updateEdits?project_id=${project_id}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );

    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const result = await res.json();
    const msg =
      result?.log ||
      `✅ Edits gespeichert (${result?.count ?? edits.length}) für Sheet: ${sheet}`;
    uiConsole(msg);
    return result;
  } catch (err) {
    console.error("❌ Failed to sync edits:", err);
    uiConsole("❌ Edits sync fehlgeschlagen");
    return { status: "error", error: String(err) };
  }
}

export async function sendPositionMap(
  sheet: string,
  rows: { project_article_id: string | number | null; position: number }[],
  project_id: number
) {
  try {
    const payload = [{ sheet, rows }];
    const res = await fetch(
      `${API_PREFIX}/api/updatePosition?project_id=${project_id}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    if (!res.ok) throw new Error("Server error");
    console.log("✅ PositionMap sent");
    return await res.json().catch(() => ({ status: "ok" }));
  } catch (err) {
    console.error("❌ Failed to sync positionMap:", err);
    return { status: "error", error: String(err) };
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

export async function fetchNextInsertedId() {
  const res = await fetch(`${API_PREFIX}/api/next_inserted_id`);
  const data = await res.json();
  if (!("next_id" in data)) throw new Error("No next_id from backend");
  return data.next_id;
}
