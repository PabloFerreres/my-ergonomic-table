import Handsontable from "handsontable";
import { GetColumnTraits } from "../Formating/columnsForm/ColumnTraits";
import { WrappedTraitsRenderer } from "../Formating/columnsForm/WrappedTraitsRenderer";
import { traitColors } from "../Formating/columnsForm/TraitColorsHeaders";

export function buildColumnDefs(
  colHeaders: string[]
): Handsontable.ColumnSettings[] {
  return colHeaders.map<Handsontable.ColumnSettings>((header, colIndex) => {
    const traits = GetColumnTraits(header);
    const cellClasses = traits.traits.filter(
      (trait) => !trait.startsWith("header-")
    );

    const base: Handsontable.ColumnSettings = {
      data: colIndex,
      editor: traits.type === "numeric" ? "numeric" : "text",
      type: traits.type,
      renderer: WrappedTraitsRenderer,
      wordWrap: true,
      className: ["htWrap", ...cellClasses].join(" "),
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

  TH.style.position = "relative";
  TH.style.fontWeight = "bold";
  TH.style.fontSize = "14px";
  TH.style.height = "100px";
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
    headerLabel.style.bottom = "4px";
    headerLabel.style.left = "-12px";
    headerLabel.style.transform = "rotate(-30deg)";
    headerLabel.style.transformOrigin = "left bottom";
    headerLabel.style.whiteSpace = "normal";
    headerLabel.style.textAlign = "left";
  }
}
