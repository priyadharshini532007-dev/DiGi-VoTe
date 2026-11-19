import { useSyncExternalStore } from 'react';

/** Tiny shared store so the sidebar badge and the header bell show the same unread count. */
let count = 0;
const subscribers = new Set();

export function setUnread(n) {
  const next = Number.isFinite(n) ? n : 0;
  if (next === count) return;
  count = next;
  subscribers.forEach((fn) => fn());
}

export function useUnread() {
  return useSyncExternalStore(
    (cb) => {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    () => count,
    () => 0,
  );
}
