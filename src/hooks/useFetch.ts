import { useCallback, useEffect, useRef, useState } from 'react';

const useFetch = <T>(fetchFunction: () => Promise<T>, autoFetch = true) => {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const fetchRef = useRef(fetchFunction);
  fetchRef.current = fetchFunction;
  const sequence = useRef(0);

  const fetchData = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchRef.current();
      if (request === sequence.current) setData(result);
    } catch (err) {
      if (request === sequence.current)
        setError(err instanceof Error ? err : new Error('An unknown error occurred'));
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    sequence.current += 1;
    setData(null);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (autoFetch) fetchData();
    return () => {
      sequence.current += 1;
    };
  }, [autoFetch, fetchData]);

  return { data, loading, error, refetch: fetchData, reset };
};

export default useFetch;
