import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../api/client.js';

/** Loads data with loading / error / reload state. `deps` re-trigger the request. */
export function useApi(loader, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const mounted = useRef(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await loaderRef.current();
      if (mounted.current) setState({ data, loading: false, error: null });
      return data;
    } catch (e) {
      if (mounted.current) setState({ data: null, loading: false, error: errorMessage(e) });
      return null;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, reload: load, setData: (data) => setState((s) => ({ ...s, data })) };
}

/** Runs a mutation with busy / error / success state. */
export function useAction() {
  const [state, setState] = useState({ busy: false, error: null, success: null });
  const run = useCallback(async (fn, successMessage) => {
    setState({ busy: true, error: null, success: null });
    try {
      const result = await fn();
      setState({ busy: false, error: null, success: successMessage ?? null });
      return result;
    } catch (e) {
      setState({ busy: false, error: errorMessage(e), success: null });
      return undefined;
    }
  }, []);
  const clear = useCallback(() => setState({ busy: false, error: null, success: null }), []);
  return { ...state, run, clear };
}
