// WrappedTraitsRenderer.ts

import { TraitsRenderer } from "./TraitsRenderer";
import Handsontable from "handsontable";

export const WrappedTraitsRenderer = (
  instance: Handsontable,
  td: HTMLTableCellElement,
  row: number,
  col: number,
  prop: string | number,
  value: unknown,
  cellProperties: Handsontable.CellProperties
): HTMLTableCellElement => {
  // 1️⃣ Original TraitsRenderer anwenden
  TraitsRenderer.call(
    instance,
    instance,
    td,
    row,
    col,
    prop,
    value as string | number | null,
    cellProperties
  );

  // 2️⃣ Word wrapping aktivieren
  td.style.whiteSpace = "normal";
  td.style.wordBreak = "break-word";
  td.style.overflowWrap = "break-word";

  // 3️⃣ Dein *text* → <span> Ersetzung
  if (typeof value === "string") {
    td.innerHTML = value.replace(/\*(.*?)\*/g, '<span class="red-inline">$1</span>');
  }

  return td;
};

export default WrappedTraitsRenderer;
