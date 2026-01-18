// src/utils/useDebounce.js
import { useEffect, useState } from "react";

/**
 * Debounce any value (e.g., input text) to avoid spamming API calls.
 */
export function useDebounce(value, delayMs = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}
