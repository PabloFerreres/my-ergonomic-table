import type Handsontable from "handsontable";

export function applyQuickFilter(
  hot: Handsontable | null,
  col: number,
  query: string,
  exact: boolean
) {
  if (!hot || col == null || col < 0) return;
  const filters = hot.getPlugin("filters");
  if (!filters) return;

  // Wenn leer: nur Bedingungen der Spalte löschen
  if (!query || String(query).trim() === "") {
    filters.removeConditions(col);
    filters.filter();
    return;
  }

  filters.removeConditions(col);
  filters.addCondition(col, exact ? "eq" : "contains", [query], "conjunction");
  filters.filter();
}
