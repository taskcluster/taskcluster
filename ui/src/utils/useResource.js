import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Fetch a single (non-paginated) Taskcluster REST resource.
 *
 * `fetch` is an async function returning the resolved value. `key` is a stable
 * string that identifies the request; when it changes the resource is
 * refetched (analogous to `usePaginatedResource`'s query key).
 */
export default function useResource(fetch, { key } = {}) {
  const [state, setState] = useState({
    data: null,
    loading: true,
    error: null,
  });
  const [reloadCount, setReloadCount] = useState(0);

  // Guards against out-of-order responses: if `key` changes while a fetch is in
  // flight, an older, slower response could clobber the newer one. Each fetch
  // captures the current id and bails out on resolution if requestId.current
  // has moved on.
  const requestId = useRef(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: key stands in for the request identity; fetch is stable per caller; reloadCount is an intentional refetch trigger.
  useEffect(() => {
    const id = ++requestId.current;

    setState(prev => ({ ...prev, loading: true, error: null }));

    Promise.resolve()
      .then(() => fetch())
      .then(data => {
        if (id !== requestId.current) {
          return;
        }

        setState({ data, loading: false, error: null });
      })
      .catch(error => {
        if (id !== requestId.current) {
          return;
        }

        setState({ data: null, loading: false, error });
      });

    return () => {
      requestId.current += 1;
    };
  }, [key, reloadCount]);

  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
    reload: useCallback(() => setReloadCount(c => c + 1), []),
  };
}
