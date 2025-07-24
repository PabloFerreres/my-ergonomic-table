import type { EditEntry } from "../editierung/EditMap";
import { getLastUsedInsertedId } from "../editierung/EditMap"; // ✅ NEU
import { uiConsole } from "../utils/uiConsole"; // ggf. Pfad anpassen
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
