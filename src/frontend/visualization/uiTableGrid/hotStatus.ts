import Handsontable from "handsontable";

export type HotStatus = { isFiltered: boolean; isSorted: boolean };

export function computeHotStatus(hot: Handsontable.Core | null): HotStatus {
  if (!hot) return { isFiltered: false, isSorted: false };

  const f = hot.getPlugin("filters");
  // robust: exportAllConditions vorhanden in modernen HOT
  const conds = f?.conditionCollection?.exportAllConditions?.() ?? [];
  const isFiltered = Array.isArray(conds) && conds.length > 0;

  const s = hot.getPlugin("columnSorting");
  const cfg = s?.getSortConfig?.();
  const isSorted = Array.isArray(cfg) ? cfg.length > 0 : Boolean(cfg);

  return { isFiltered, isSorted };
}
