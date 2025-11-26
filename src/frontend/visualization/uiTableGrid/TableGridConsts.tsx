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
  traitsMap: Record<string, Awaited<ReturnType<typeof GetColumnTraits>>> = {},
  columnDataSources: Record<string, string> = {}
) {
  const header = colHeaders[col];
  if (!header) return;
  const traits = traitsMap[header] || { header };
  // Data source label for filter button
  const dataSource = columnDataSources[header];
  let dataSourceLabel = "";
  if (dataSource === "cad") dataSourceLabel = "CAD";
  else if (dataSource === "table") dataSourceLabel = "TBL";
  else if (dataSource === "articles") dataSourceLabel = "ART";
  else if (dataSource === "intern") dataSourceLabel = "INTR";
  // Remove colored line if present
  const oldLine = TH.querySelector(".header-underline") as HTMLElement;
  if (oldLine) TH.removeChild(oldLine);
  // Edit icon for editable columns
  const isEditable =
    !["cad", "intern", "articles"].includes(dataSource) &&
    header !== "order_key" &&
    header !== "project_article_id";
  let iconSrc = "/edit-icon-grey.png";
  if (dataSource === "articles") {
    iconSrc = "/editable-rowbased-grey.png";
  }
  if (isEditable || dataSource === "articles") {
    let icon = TH.querySelector(".edit-icon") as HTMLImageElement;
    if (!icon) {
      icon = document.createElement("img");
      icon.className = "edit-icon";
      icon.style.position = "absolute";
      icon.style.top = "4px";
      icon.style.right = "4px";
      icon.style.width = "16px";
      icon.style.height = "16px";
      icon.style.zIndex = "10";
      TH.appendChild(icon);
    }
    icon.src = iconSrc;
    icon.style.display = "block";
  } else {
    const icon = TH.querySelector(".edit-icon") as HTMLImageElement;
    if (icon) icon.style.display = "none";
  }
  // Set filter button label to data source, remove arrow, and style smaller
  const button = TH.querySelector("button.changeType") as HTMLButtonElement;
  if (button && dataSourceLabel) {
    // Set only text, let arrow stay
    button.textContent = dataSourceLabel;
    button.title = `Data source: ${dataSourceLabel}`;
    button.style.fontSize = "24px";
    button.style.fontWeight = "bold";
    button.style.padding = "6px 24px 6px 6px";
    button.style.background = "#eaeaea";
    button.style.border = "1px solid #ccc";
    button.style.borderRadius = "8px";
    button.style.height = "32px";
    button.style.lineHeight = "1.2";
    button.style.width = "auto";
    button.style.display = "inline-flex";
    button.style.alignItems = "center";
    button.style.verticalAlign = "middle";
    // Reduce gap between arrow and text if arrow is present
    const arrow = button.querySelector(".arrow");
    if (arrow && arrow instanceof HTMLElement) arrow.style.marginLeft = "4px";
  }
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
  const buttonElement = TH.querySelector("button.changeType") as HTMLElement;
  if (wrapper && buttonElement && wrapper.contains(buttonElement)) {
    wrapper.removeChild(buttonElement);
    TH.appendChild(buttonElement);
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
