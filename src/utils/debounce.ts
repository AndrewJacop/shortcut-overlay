import { useCallback, useRef } from "react";

/**
 * Returns a debounced version of `fn` that delays invocation until `delay`ms
 * have passed since the last call. Cleans up automatically on unmount.
 */
export function useDebouncedCallback<T extends unknown[]>(
  fn: (...args: T) => void,
  delay: number,
): (...args: T) => void {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  return useCallback(
    (...args: T) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => fn(...args), delay);
    },
    [fn, delay],
  );
}
