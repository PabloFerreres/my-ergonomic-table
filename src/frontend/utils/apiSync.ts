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

// oben (bei den Imports) ergänzen
type SendResult = {
  status?: "ok" | "saved";
  error?: string;
  count?: number;
  log?: string;
};

export async function sendEdits(
  sheet: string,
  edits: EditEntry[],
  project_id: number
): Promise<SendResult> {
  if (!edits || edits.length === 0) {
    return { status: "ok", count: 0, log: "⚪️ keine Edits" };
  }

  const payload = {
    sheet, // wichtig für Backend-Entscheidung (SSE/Remat)
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

  const text = await res.text();

  // parse + normalisieren auf SendResult
  let result: SendResult | null = null;
  let raw: any = null;
  try { raw = text ? JSON.parse(text) : null; } catch { raw = null; }

  if (raw) {
    const s = raw.status;
    result = {
      status: s === "ok" || s === "saved" ? s : undefined,
      error: typeof raw.error === "string" ? raw.error : undefined,
      count: typeof raw.count === "number" ? raw.count : undefined,
      log: typeof raw.log === "string" ? raw.log : undefined,
    };
  }

  // ❗ HTTP-Fehler → werfen
  if (!res.ok) {
    const msg = result?.error || `Server error ${res.status}`;
    console.error("🛑 sendEdits() HTTP error", {
      sheet, editsCount: edits.length, status: res.status, result
    });
    uiConsole(`❌ Edits sync fehlgeschlagen: ${msg}`);
    throw new Error(msg);
  }

  // ❗ Logischer Fehler
  if (raw?.status && raw.status !== "ok" && raw.status !== "saved") {
    const msg = result?.error || `Bad status: ${raw.status}`;
    console.error("🛑 sendEdits() logical error", {
      sheet, editsCount: edits.length, rawStatus: raw.status, result
    });
    uiConsole(`❌ Edits sync fehlgeschlagen: ${msg}`);
    throw new Error(msg);
  }

  const msg =
    result?.log ||
    `✅ Edits gespeichert (${result?.count ?? edits.length}) für Sheet: ${sheet}`;
  uiConsole(msg);

  return result ?? { status: "ok", count: edits.length };
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
