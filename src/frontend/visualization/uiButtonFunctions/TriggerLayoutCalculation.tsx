import config from "../../../../config.json";
const API_PREFIX = config.BACKEND_URL;

export async function triggerLayoutCalculation(
  headers: string[],
  data: (string | number)[][],
  onSuccess: (result: {
    columnWidths: Record<string, number>;
    rowHeights: Record<number, number>;
  }) => void
) {
  try {
    const res = await fetch(`${API_PREFIX}/api/layout/estimate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ headers, data }),
    });

    const result = await res.json();
    console.log("📊 Layout estimation result:", result);
    onSuccess(result);
  } catch (err) {
    console.error("❌ Failed to trigger layout calculation:", err);
  }
}
