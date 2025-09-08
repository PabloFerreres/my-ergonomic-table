// lightweight store for per-sheet header_rows state

type Listener = () => void;

const state = new Map<string, boolean>(); // sheet_name (lowercase) -> on/off
const pending = new Set<string>();        // waiting for server confirm
const listeners = new Set<Listener>();

const key = (s: string) => s.toLowerCase();
const emit = () => { listeners.forEach(fn => { try { fn(); } catch {} }); };

export function subscribe(cb: Listener) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getHeaderRows(sheet: string): boolean {
  return state.get(key(sheet)) ?? true; // default ON
}

export function setHeaderRows(sheet: string, on: boolean) {
  state.set(key(sheet), on);
  pending.delete(key(sheet));
  emit();
}

export function isPending(sheet: string): boolean {
  return pending.has(key(sheet));
}

export function markPending(sheet: string) {
  pending.add(key(sheet));
  emit();
}

export function clearPending(sheet: string) {
  pending.delete(key(sheet));
  emit();
}
