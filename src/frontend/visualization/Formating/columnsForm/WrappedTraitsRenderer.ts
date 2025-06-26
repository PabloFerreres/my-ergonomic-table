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
  // Ensure TraitsRenderer receives the correct `this` context
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

  td.style.whiteSpace = "normal";
  td.style.wordBreak = "break-word";
  td.style.overflowWrap = "break-word";

  return td;
};

export default WrappedTraitsRenderer;
