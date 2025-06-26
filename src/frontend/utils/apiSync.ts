import type { EditEntry } from "../editierung/EditMap";
import { getLastUsedInsertedId } from "../editierung/EditMap"; // ✅ NEU

export async function sendEdits(sheet: string, edits: EditEntry[]) {
  try {
    const payload = {
      edits,
      lastUsedInsertedId: getLastUsedInsertedId(), // ✅ NEU
    };

    const res = await fetch(`http://localhost:8000/api/updateEdits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(`Server error`);
    const result = await res.json();
    console.log(`✅ Edits gespeichert (${result.count}) für Sheet: ${sheet}`);
  } catch (err) {
    console.error("❌ Failed to sync edits:", err);
  }
}



export async function sendPositionMap(
  sheet: string,
  rows: { project_article_id: string | number; position: number }[]
) {
  try {
    const payload = [{ sheet, rows }]; // ✅ exakt wie bei updateDraft
    const res = await fetch("http://localhost:8000/api/updatePosition", {
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
