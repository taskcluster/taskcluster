import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Fetch a paginated Taskcluster REST collection.
 */
export default function usePaginatedResource(fetch, { payload, select }) {
  const [state, setState] = useState({
    items: [],
    continuationToken: null,
    loading: true,
    error: null,
  });
  const [page, setPage] = useState(0);
  const [reloadCount, setReloadCount] = useState(0);

  const pageContinuationTokens = useRef([null]);

  // Guards against out-of-order responses: if the user changes the page or
  // query while a fetch is in flight, an older, slower response could clobber
  // the newer one. Each fetch captures the current id and bails out on
  // resolution if requestId.current has moved on.
  const requestId = useRef(0);

  const queryKey = JSON.stringify(payload ?? {});
  const [prevQueryKey, setPrevQueryKey] = useState(queryKey);

  if (prevQueryKey !== queryKey) {
    setPrevQueryKey(queryKey);
    pageContinuationTokens.current = [null];
    setPage(0);
    setState(prev => ({
      ...prev,
      items: [],
      continuationToken: null,
      loading: true,
    }));
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: queryKey stands in for payload (stable across identity-only changes); fetch and select are stable per caller; reloadCount is an intentional refetch trigger.
  useEffect(() => {
    const id = ++requestId.current;

    setState(prev => ({ ...prev, loading: true, error: null }));

    const options = { ...payload };

    const continuationToken = pageContinuationTokens.current[page];

    if (continuationToken) {
      options.continuationToken = continuationToken;
    }

    fetch(options)
      .then(response => {
        if (id !== requestId.current) {
          return;
        }

        setState({
          items: select(response),
          continuationToken: response.continuationToken ?? null,
          loading: false,
          error: null,
        });
      })
      .catch(error => {
        if (id !== requestId.current) {
          return;
        }

        setState(prev => ({ ...prev, loading: false, error }));
      });

    return () => {
      requestId.current += 1;
    };
  }, [queryKey, page, reloadCount]);

  const nextPage = useCallback(() => {
    if (state.loading || !state.continuationToken) {
      return;
    }

    pageContinuationTokens.current[page + 1] = state.continuationToken;
    setPage(page + 1);
  }, [page, state.loading, state.continuationToken]);

  const previousPage = useCallback(() => setPage(p => Math.max(0, p - 1)), []);

  return {
    items: state.items,
    loading: state.loading,
    error: state.error,
    page,
    hasNextPage: Boolean(state.continuationToken),
    hasPreviousPage: page > 0,
    nextPage,
    previousPage,
    reload: useCallback(() => setReloadCount(c => c + 1), []),
  };
}
