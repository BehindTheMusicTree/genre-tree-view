import { useCallback, useEffect, useRef } from "react";

import type { GenreNodeStyleResolver } from "./types";

/** Publishes `resolver` to the host once through `onChange`, as a stable function that always
 * reads the renderer's latest `resolver` — so the host's panel never needs a re-publish. */
export function useExposeNodeStyleResolver(
  onChange: ((resolver: GenreNodeStyleResolver) => void) | undefined,
  resolver: GenreNodeStyleResolver,
): void {
  const latest = useRef(resolver);
  useEffect(() => {
    latest.current = resolver;
  });
  const stable = useCallback<GenreNodeStyleResolver>((node) => latest.current(node), []);
  useEffect(() => {
    onChange?.(stable);
  }, [onChange, stable]);
}
