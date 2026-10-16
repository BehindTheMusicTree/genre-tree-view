import { useState } from "react";

interface FocusHistoryState {
  seen: string | null;
  stack: (string | null)[];
  pending: string | null | undefined;
}

/** Remembers the focus the wheel actually displayed, whatever changed it (wheel buttons, search,
 * rejection, or the consumer). `previous` is the latest remembered view that is still focusable and
 * differs from the current one; `undefined` means there is nothing to go back to. */
export function useFocusHistory(focusNodeId: string | null, isFocusable: (id: string) => boolean) {
  const [state, setState] = useState<FocusHistoryState>({ seen: focusNodeId, stack: [], pending: undefined });

  if (state.seen !== focusNodeId) {
    // ponytail: unbounded, in-memory only; cap it if sessions ever get long enough to matter.
    const popTo = state.pending === focusNodeId ? state.stack.lastIndexOf(focusNodeId) : -1;
    setState({
      seen: focusNodeId,
      stack: popTo >= 0 ? state.stack.slice(0, popTo) : [...state.stack, state.seen],
      pending: undefined,
    });
  }

  let previous: string | null | undefined;
  for (let i = state.stack.length - 1; i >= 0; i--) {
    const entry = state.stack[i];
    if (entry !== focusNodeId && (entry === null || isFocusable(entry))) {
      previous = entry;
      break;
    }
  }

  const markPreviousRequested = (id: string | null) => setState((current) => ({ ...current, pending: id }));

  return { previous, markPreviousRequested };
}
