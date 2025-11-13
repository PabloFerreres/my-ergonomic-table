import { useEffect, useState } from "react";
import Handsontable from "handsontable";
import { GetColumnTraits } from "../Formating/ColumnTraits";
import { WrappedTraitsRenderer } from "../Formating/WrappedTraitsRenderer";

// Helper to get traits for all headers (async)
export function useHeaderTraits(colHeaders: string[]) {
  const [traitsMap, setTraitsMap] = useState<
    Record<string, Awaited<ReturnType<typeof GetColumnTraits>>>
  >({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        colHeaders.map(async (header) => [
          header,
          await GetColumnTraits(header),
        ])
      );
      if (!cancelled) {
        setTraitsMap(Object.fromEntries(entries));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [colHeaders]);
  return traitsMap;
}

export function buildColumnDefs(
  colHeaders: string[],
  traitsMap: Record<string, Awaited<ReturnType<typeof GetColumnTraits>>> = {}
): Handsontable.ColumnSettings[] {
  return colHeaders.map<Handsontable.ColumnSettings>((header, colIndex) => {
    const traits = traitsMap[header] || { header, type: "text" };
    const base: Handsontable.ColumnSettings = {
      data: colIndex,
      editor: traits.type === "numeric" ? "numeric" : "text",
      type: traits.type,
      renderer: WrappedTraitsRenderer,
      wordWrap: true,
      className: ["htWrap", traits.colorName ? traits.colorName : ""]
        .filter(Boolean)
        .join(" "),
      filter: true,
      readOnly: false,
      allowInvalid: true,
    };
    return base;
  });
}

export function afterGetColHeader(
  col: number,
  TH: HTMLTableCellElement,
  colHeaders: string[],
  traitsMap: Record<string, Awaited<ReturnType<typeof GetColumnTraits>>> = {}
) {
  const header = colHeaders[col];
  if (!header) return;
  const traits = traitsMap[header] || { header };
  if (traits.color) {
    TH.style.backgroundColor = traits.color;
    TH.style.color = "#000";
  } else {
    TH.style.backgroundColor = "#f0f0f0";
    TH.style.color = "#000";
  }
  if (traits.colorName) {
    TH.classList.add(traits.colorName);
  }
  TH.style.position = "relative";
  TH.style.fontWeight = "bold";
  TH.style.fontSize = "12px";
  TH.style.height = "110px";
  TH.style.lineHeight = "1";
  TH.style.overflow = "visible";
  TH.style.paddingRight = "32px";
  TH.style.paddingTop = "0px";
  TH.style.paddingBottom = "0px";
  const wrapper = TH.querySelector("div") as HTMLElement;
  const button = TH.querySelector("button.changeType") as HTMLElement;
  if (wrapper && button && wrapper.contains(button)) {
    wrapper.removeChild(button);
    TH.appendChild(button);
  }
  if (wrapper) wrapper.style.position = "static";
  const headerLabel = TH.querySelector(".colHeader") as HTMLElement;
  if (headerLabel) {
    headerLabel.style.position = "absolute";
    headerLabel.style.bottom = "0px";
    headerLabel.style.left = "-5px";
    headerLabel.style.transform = "rotate(-30deg)";
    headerLabel.style.transformOrigin = "left bottom";
    headerLabel.style.whiteSpace = "normal";
    headerLabel.style.textAlign = "left";
  }
}

export function handleAfterFilter(
  hotInstance: Handsontable.Core | null,
  _colHeaders: string[],
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
