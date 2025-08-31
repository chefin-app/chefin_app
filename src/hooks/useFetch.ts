import { useEffect, useState } from 'react';

const useFetch = <T>(fetchFunction: () => Promise<T>, autoFetch = true) => {
  // useFetch hook takes a fetch function and an optional autoFetch boolean

  const [data, setData] = useState<T | null>(null); // state to hold fetched data
  const [loading, setLoading] = useState(false); // could be used to show a loading spinner or something
  const [error, setError] = useState<Error | null>(null); // could be used to show an error message

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await fetchFunction();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('An unknown error occurred')); // type guard to ensure err is of type Error
    } finally {
      setLoading(false); // after fetching loading is set to false
    }
  };
  const reset = () => {
    // reset state to initial values
    setData(null);
    setError(null);
    setLoading(false);
  };

  useEffect(() => {
    // fetch data on mount if autoFetch is true
    if (autoFetch && data === null) {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  console.log('useFetch Called.');
  return { data, loading, error, refetch: fetchData, reset }; // return data, loading, error and a function to refetch the data
};

export default useFetch; // export the hook
