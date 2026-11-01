import { useSyncExternalStore } from 'react';

/* Shared, read-only view of the live Firestore data.
   The legacy engine (which still owns the Firestore listeners) pushes every snapshot here, so React
   components read the same data without opening a second set of listeners (no doubled Firestore reads).
   Each key is replaced (never mutated), so a component that selects one key re-renders only when it changes. */
let snapshot = { buckets: [], logs: [], sessions: [], session: {} };
const subs = new Set();

export const bridge = {
  get: () => snapshot,
  set(key, value){
    if (snapshot[key] === value) return;
    snapshot = { ...snapshot, [key]: value };
    subs.forEach(fn => fn());
  },
  subscribe(fn){ subs.add(fn); return () => subs.delete(fn); }
};

/* useEngine(s => s.logs). The selector must return an existing value, never a freshly built object. */
export function useEngine(selector){
  return useSyncExternalStore(bridge.subscribe, () => selector(snapshot), () => selector(snapshot));
}
