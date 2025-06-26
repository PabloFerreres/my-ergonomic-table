import {
  getNextNegativeRowId as getNextIdFromManager,
  getLastUsedInsertedId as getLastIdFromManager,
} from "../utils/insertIdManager";

export type EditEntry = {
  col: string | number;
  colName?: string;
  rowId: string | number;
  originalValue: string | number;
  oldValue: string | number;
  newValue: string | number;
  sheet: string;
  saved: boolean;
  timestamp: number;
  timestampReadable: string;
};

export type RowMoveEntry = { rowId: string | number; newPosition: number };
export type RowDeleteEntry = { rowId: string | number };

export type EditMapStore = Record<string, EditEntry[]> & {
  _rowMoves?: Record<string, RowMoveEntry[]>;
  _rowDeletes?: Record<string, RowDeleteEntry[]>;
  _visualOrder?: Record<string, { rowId: string | number; position: number }[]>;
};

const editMap: EditMapStore = {};

// Verwende insertIdManager statt eigener interner Zähler
export const getNextNegativeRowId = () => getNextIdFromManager();
export const getLastUsedInsertedId = () => getLastIdFromManager();

// === edit entries ===
export const addEdit = (
  entry: Omit<
    EditEntry,
    "saved" | "timestamp" | "timestampReadable" | "originalValue"
  >
) => {
  const normalize = (v: unknown): string | number => {
    if (v === null || v === undefined) return "";
    if (typeof v === "string" || typeof v === "number") return v;
    return String(v);
  };
  const now = Date.now();
  const sheet = entry.sheet;
  if (!editMap[sheet]) editMap[sheet] = [];

  const newVal = normalize(entry.newValue);
  const oldVal = normalize(entry.oldValue);

  const existingIndex = editMap[sheet].findIndex(
    (e) => e.rowId === entry.rowId && e.col === entry.col
  );

  if (existingIndex !== -1) {
    const originalValue = editMap[sheet][existingIndex].originalValue;
    if (newVal === originalValue) {
      editMap[sheet].splice(existingIndex, 1);
      return;
    }
    editMap[sheet][existingIndex] = {
      ...entry,
      oldValue: oldVal,
      newValue: newVal,
      originalValue,
      saved: false,
      timestamp: now,
      timestampReadable: new Date(now).toISOString(),
    };
  } else {
    if (oldVal === newVal) return;
    const fullEntry: EditEntry = {
      ...entry,
      oldValue: oldVal,
      newValue: newVal,
      originalValue: oldVal,
      saved: false,
      timestamp: now,
      timestampReadable: new Date(now).toISOString(),
    };
    editMap[sheet].push(fullEntry);
  }
};

// === helpers ===
export const getEdits = (sheet?: string): EditEntry[] => {
  if (sheet) return [...(editMap[sheet] ?? [])];
  return Object.entries(editMap)
    .filter(([k]) => !k.startsWith("_"))
    .flatMap(([, v]) => v as EditEntry[]);
};

export const clearEdits = (sheet?: string) => {
  if (sheet) delete editMap[sheet];
  else for (const key in editMap) if (!key.startsWith("_")) delete editMap[key];
};

export const markAsSaved = (sheet: string) => {
  if (editMap[sheet]) {
    editMap[sheet].forEach((entry) => (entry.saved = true));
  }
};

export const getUnsavedEdits = (sheet?: string): EditEntry[] =>
  getEdits(sheet).filter((e) => !e.saved);

export const getRawEditMap = (): EditMapStore => editMap;

// === row operations ===
export const moveRow = (
  sheet: string,
  rowId: string | number,
  newPosition: number
) => {
  if (!editMap._rowMoves) editMap._rowMoves = {};
  if (!editMap._rowMoves[sheet]) editMap._rowMoves[sheet] = [];

  const idx = editMap._rowMoves[sheet].findIndex((e) => e.rowId === rowId);
  if (idx !== -1) {
    editMap._rowMoves[sheet][idx].newPosition = newPosition;
  } else {
    editMap._rowMoves[sheet].push({ rowId, newPosition });
  }
};

export const getRowMoves = (sheet: string): RowMoveEntry[] => {
  return editMap._rowMoves?.[sheet] ?? [];
};

export const deleteRow = (sheet: string, rowId: string | number) => {
  if (!editMap._rowDeletes) editMap._rowDeletes = {};
  if (!editMap._rowDeletes[sheet]) editMap._rowDeletes[sheet] = [];

  editMap._rowDeletes[sheet].push({ rowId });
};

export const getDeletedRows = (sheet: string): RowDeleteEntry[] =>
  editMap._rowDeletes?.[sheet] ?? [];

// === visual row order ===
export const setVisualRowOrder = (
  sheet: string,
  rowIds: (string | number)[]
) => {
  if (!editMap._visualOrder) editMap._visualOrder = {};
  editMap._visualOrder[sheet] = rowIds.map((id, index) => ({
    rowId: id,
    position: index + 1,
  }));
};

export const getVisualRowOrder = (
  sheet: string
): { rowId: string | number; position: number }[] =>
  editMap._visualOrder?.[sheet] ?? [];
