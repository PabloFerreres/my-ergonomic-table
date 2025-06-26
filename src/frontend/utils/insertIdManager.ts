let nextNegativeId = -1;

export function setInitialInsertedId(fromDb: number) {
  nextNegativeId = fromDb - 1;
}

export function getNextNegativeRowId(): number {
  return nextNegativeId--;
}

export function getLastUsedInsertedId(): number {
  return nextNegativeId + 1;
}