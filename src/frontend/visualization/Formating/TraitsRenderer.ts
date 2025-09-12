import Handsontable from "handsontable";
import { traitColors } from "./TraitColorsHeaders";

// 'this: Handsontable' makes the implicit 'this' usage valid and typed
export function TraitsRenderer(
  this: Handsontable,
  instance: Handsontable,
  td: HTMLTableCellElement,
  row: number,
  col: number,
  prop: string | number,
  value: string | number | null,
  cellProperties: Handsontable.CellProperties
): void {
  Handsontable.renderers.TextRenderer.call(this, instance, td, row, col, prop, value, cellProperties);

  td.style.backgroundColor = "#ffffff";
  td.style.color = "#000000";

  const classes = (cellProperties.customClass || "").split(" ");

  for (const cls of classes) {
    if (cls.startsWith("header-")) continue;
    if (traitColors[cls]) {
      td.style.backgroundColor = traitColors[cls].bg;
      td.style.color = traitColors[cls].fg;
      break;
    }
  }
}
