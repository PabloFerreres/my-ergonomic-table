import Handsontable from "handsontable";

export type HotStatus = { isFiltered: boolean; isSorted: boolean };

function hasAnyConditionsViaGetConditions(hot: Handsontable.Core): boolean {
  const f: any = hot.getPlugin?.("filters");
  if (!f) return false;
  const cols = hot.countCols?.() ?? 0;
  for (let c = 0; c < cols; c++) {
    const cond = f.getConditions?.(c);
    if (Array.isArray(cond) && cond.length > 0) return true;
    if (cond && !Array.isArray(cond) && (cond as any).length > 0) return true;
  }
  return false;
}

function hasAnyConditionsViaExport(hot: Handsontable.Core): boolean {
  const cc: any = hot.getPlugin?.("filters")?.conditionCollection;
  const all = cc?.exportAllConditions?.() ?? [];
  if (!Array.isArray(all) || all.length === 0) return false;
  return all.some((e: any) => {
    const arr = e?.conditions ?? e?.condition ?? [];
    return Array.isArray(arr) ? arr.length > 0 : !!arr;
  });
}

export function computeHotStatus(hot: Handsontable.Core | null): HotStatus {
  if (!hot) return { isFiltered: false, isSorted: false };

  const byGet = hasAnyConditionsViaGetConditions(hot);
  const byExport = hasAnyConditionsViaExport(hot);
  const total = hot.countRows?.() ?? 0;
  const visible = (hot as any).countVisibleRows?.() ?? total;

  const isFiltered = byGet || byExport || (visible < total);

  const s: any = hot.getPlugin?.("columnSorting");
  const cfg = s?.getSortConfig?.();
  const isSorted = Array.isArray(cfg) ? cfg.length > 0 : Boolean(cfg);

  return { isFiltered, isSorted };
}
