import Handsontable from "handsontable";

export type HotStatus = { isFiltered: boolean; isSorted: boolean };

export function computeHotStatus(hot?: Handsontable.Core | null): HotStatus {
  if (!hot) return { isFiltered: false, isSorted: false };

  const filters: any = hot.getPlugin?.("filters");
  const exported = filters?.conditionCollection?.exportAllConditions?.() ?? [];

  const normalize = (v: any) => (v == null ? null : v); // null/undef zusammenführen

  const isEntryEffective = (entry: any): boolean => {
    const col = entry?.column;
    const conds = entry?.conditions ?? entry?.condition ?? [];
    const arr = Array.isArray(conds) ? conds : [conds];
    if (arr.length === 0) return false;

    // Irgendwas anderes als by_value => wirkt
    if (arr.some((c: any) => c?.name !== "by_value")) return true;

    // Nur by_value: prüfe, ob wirklich eingeschränkt wird
    const byv = arr.find((c: any) => c?.name === "by_value");
    const selected: any[] = Array.isArray(byv?.args?.[0]) ? byv.args[0] : [];

    // Universum aus *Source*-Daten (ungefiltert!)
    const rows = hot.countSourceRows?.() ?? hot.countRows?.() ?? 0;
    const universe = new Set<any>();
    for (let r = 0; r < rows; r++) {
      universe.add(normalize((hot as any).getSourceDataAtCell?.(r, col)));
    }

    const selectedSet = new Set(selected.map(normalize));

    // gleich groß & gleiche Elemente => NO-OP (nicht gefiltert)
    if (selectedSet.size === universe.size) {
      for (const v of selectedSet) if (!universe.has(v)) return true;
      return false;
    }
    return true;
  };

  const isFiltered = exported.some(isEntryEffective);

  const sorting: any = hot.getPlugin?.("columnSorting");
  const cfg = sorting?.getSortConfig?.() ?? [];
  const isSorted = Array.isArray(cfg) ? cfg.length > 0 : !!cfg;

  return { isFiltered, isSorted };
}
