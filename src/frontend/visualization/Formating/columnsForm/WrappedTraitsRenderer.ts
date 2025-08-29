// WrappedTraitsRenderer.ts

import { TraitsRenderer } from "./TraitsRenderer";
import Handsontable from "handsontable";

const STAR_INLINE_RE = /\*(.*?)\*/g;
const KOMMENTAR_IDX_CACHE = new WeakMap<Handsontable, number>();
const TD_WRAPPED = new WeakSet<HTMLTableCellElement>();

type RowState = { kTxt: string; isHeader: boolean; isEntfallen: boolean };
type HetCellMeta = Partial<Handsontable.CellProperties> & { _hetRowState?: RowState };

function getKommentarIdx(instance: Handsontable): number {
  const cached = KOMMENTAR_IDX_CACHE.get(instance);
  if (cached !== undefined) return cached;
  const headers = instance.getColHeader();
  const arr = Array.isArray(headers) ? (headers as string[]) : [];
  const idx = arr.findIndex((h) => String(h).trim().toLowerCase() === "kommentar");
  KOMMENTAR_IDX_CACHE.set(instance, idx);
  return idx;
}

function getRowState(
  instance: Handsontable,
  row: number,
  col: number,
  kommentarIdx: number,
  value: unknown
): RowState | null {
  if (kommentarIdx < 0) return null;

  const meta0 = instance.getCellMeta(row, 0) as unknown as HetCellMeta;
  let state = meta0._hetRowState;

  let kTxt: string;
  if (col === kommentarIdx && typeof value === "string") {
    kTxt = value.trim();
  } else if (state) {
    kTxt = state.kTxt;
  } else {
    const v = instance.getDataAtCell(row, kommentarIdx);
    kTxt = v == null ? "" : String(v).trim();
  }

  const isHeader = kTxt === "HEADER";
  const isEntfallen = /entfallen/i.test(kTxt);

  if (!state || state.kTxt !== kTxt || state.isHeader !== isHeader || state.isEntfallen !== isEntfallen) {
    state = { kTxt, isHeader, isEntfallen };
    meta0._hetRowState = state;
  }
  return state;
}

export const WrappedTraitsRenderer = (
  instance: Handsontable,
  td: HTMLTableCellElement,
  row: number,
  col: number,
  prop: string | number,
  value: unknown,
  cellProperties: Handsontable.CellProperties
): HTMLTableCellElement => {
  // 1) Basis-Renderer (TextRenderer + Traits)
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

  // 2) Word-Wrap Styles nur einmal je recycelter TD setzen
  if (!TD_WRAPPED.has(td)) {
    td.style.whiteSpace = "normal";
    td.style.wordBreak = "break-word";
    td.style.overflowWrap = "break-word";
    TD_WRAPPED.add(td);
  }

  // 3) *text* → <span class="red-inline">text</span> (nur wenn nötig)
  if (typeof value === "string" && value.includes("*")) {
    if (STAR_INLINE_RE.test(value)) {
      td.innerHTML = value.replace(STAR_INLINE_RE, '<span class="red-inline">$1</span>');
    }
    STAR_INLINE_RE.lastIndex = 0;
  }

  // 4) HEADER / ENTFALLEN + readOnly direkt im cellProperties (render-basiert, sort/filter-sicher)
  const kommentarIdx = getKommentarIdx(instance);
  const rs = getRowState(instance, row, col, kommentarIdx, value);

  if (rs) {
    td.classList.toggle("het-header-row", rs.isHeader);
    td.classList.toggle("row-entfallen", rs.isEntfallen);

    if (rs.isHeader) {
      // Hard block: HOT verhindert Edit/Paste automatisch bei readOnly
      cellProperties.readOnly = true;
      cellProperties.editor = false;
    }
  } else {
    td.classList.remove("het-header-row", "row-entfallen");
  }

  return td;
};

export default WrappedTraitsRenderer;
