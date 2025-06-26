export async function triggerLayoutCalculation(
  headers: string[],
  data: (string | number)[][],
  onSuccess: (result: {
    columnWidths: Record<string, number>;
    rowHeights: Record<number, number>;
  }) => void
) {
  try {
    const res = await fetch("http://localhost:8000/api/layout/estimate", {
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
