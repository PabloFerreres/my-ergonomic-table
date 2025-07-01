// src/frontend/visualization/uiTableGrid/TableGridConsts.tsx
import Handsontable from "handsontable";
import { GetColumnTraits } from "../Formating/columnsForm/ColumnTraits";
import { WrappedTraitsRenderer } from "../Formating/columnsForm/WrappedTraitsRenderer";
import { traitColors } from "../Formating/columnsForm/TraitColorsHeaders";

// Builds column definitions based on traits
export function buildColumnDefs(colHeaders: string[]) {
  return colHeaders.map((header, colIndex) => {
    const traits = GetColumnTraits(header);
    const cellClasses = traits.traits.filter(
      (trait) => !trait.startsWith("header-")
    );
    return {
      data: colIndex,
      editor: "text",
      type: traits.type,
      renderer: WrappedTraitsRenderer,
      wordWrap: true,
      className: ["htWrap", ...cellClasses].join(" "),
      filter: true,
      readOnly: false,
    };
  });
}

// Styles table header cells based on trait colors
// Styles table header cells based on trait colors
export function afterGetColHeader(
  col: number,
  TH: HTMLTableCellElement,
  colHeaders: string[]
) {
  const header = colHeaders[col];
  if (!header) return;

  const traits = GetColumnTraits(header);
  const colorTrait = traits.traits.find((t) => traitColors[t]);

  if (colorTrait) {
    const { bg, fg } = traitColors[colorTrait];
    TH.style.backgroundColor = bg;
    TH.style.color = fg;
  } else {
    TH.style.backgroundColor = "#f0f0f0";
    TH.style.color = "#000";
  }

  // 🧱 Stabiler Header: feste Höhe, keine dynamischen Padding-Sprünge
  TH.style.fontWeight = "bold";
  TH.style.fontSize = "14px";
  TH.style.height = "60px";
  TH.style.lineHeight = "40px";
  TH.style.padding = "0 5px";
  TH.style.overflow = "hidden";
  TH.style.whiteSpace = "nowrap";
  TH.style.position = "relative";

  // 🔽 Filter-Dropdown korrekt sichtbar platzieren
  const dropdown = TH.querySelector(".htFiltersMenu") as HTMLElement;
  if (dropdown) {
    dropdown.style.position = "absolute";
    dropdown.style.top = "2px";
    dropdown.style.right = "4px";
    dropdown.style.zIndex = "999";
    dropdown.style.pointerEvents = "auto";
    dropdown.style.display = "block";
  }
}

// Handles afterFilter: uses getActiveColumns() instead of isFilterActive()
export function handleAfterFilter(
  hotInstance: Handsontable.Core | null,
  colHeaders: string[],
  afterFilter?: (isActive: boolean) => void
) {
  if (!hotInstance || !afterFilter) return;

  const filtersPlugin = hotInstance.getPlugin("filters");

  const conditions =
    filtersPlugin.conditionCollection?.exportAllConditions?.() ?? [];
  const isActive = Array.isArray(conditions) && conditions.length > 0;

  const visibleRows = hotInstance.countVisibleRows();

  if (isActive && visibleRows === 0) {
    alert(
      "Achtung: Kein Ergebnis durch die Filter! Es werden keine Zeilen angezeigt."
    );
  }

  afterFilter(isActive);
}
