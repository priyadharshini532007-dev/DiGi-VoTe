import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Runs `fetcher(key)` for every key in parallel and collects the successful results by key.
 * Individual failures are counted, never thrown, so one inaccessible election cannot blank a dashboard.
 */
export function useFanOut(keys, fetcher) {
  const [state, setState] = useState({ data: {}, loading: keys.length > 0, failed: 0 });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const keysRef = useRef(keys);
  keysRef.current = keys;
  const signature = keys.join(',');
  const alive = useRef(true);

  const load = useCallback(async () => {
    const current = keysRef.current;
    if (!current.length) {
      setState({ data: {}, loading: false, failed: 0 });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    const results = await Promise.allSettled(current.map((k) => fetcherRef.current(k)));
    const data = {};
    let failed = 0;
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') data[current[i]] = r.value;
      else failed += 1;
    });
    if (alive.current) setState({ data, loading: false, failed });
  }, []);

  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return { ...state, reload: load };
}
