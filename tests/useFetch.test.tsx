import { act, renderHook } from '@testing-library/react-native';
import useFetch from '@/src/hooks/useFetch';

it('keeps newer search results when an earlier slow request finishes last', async () => {
  let finishOld!: (value: string) => void;
  const old = new Promise<string>(resolve => {
    finishOld = resolve;
  });
  const { result, rerender } = renderHook(
    (props: { load: () => Promise<string> }) => useFetch(props.load, false),
    {
      initialProps: { load: () => old },
    }
  );
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.refetch();
  });
  rerender({ load: () => Promise.resolve('new') });
  await act(async () => {
    await result.current.refetch();
  });
  await act(async () => {
    finishOld('old');
    await pending;
  });
  expect(result.current.data).toBe('new');
  expect(result.current.loading).toBe(false);
});

it('does not repopulate cleared search results from an in-flight request', async () => {
  let finish!: (value: string) => void;
  const request = new Promise<string>(resolve => {
    finish = resolve;
  });
  const { result } = renderHook(() => useFetch(() => request, false));
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.refetch();
  });
  act(() => result.current.reset());
  await act(async () => {
    finish('old');
    await pending;
  });
  expect(result.current.data).toBeNull();
  expect(result.current.loading).toBe(false);
});
