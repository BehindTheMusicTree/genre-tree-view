import { DOUBLE_CLICK_DELAY_MS } from "./constants";

/** Runs a click's action only once no second click follows, so the pan/zoom glide it starts can't
 * move the target out from under the cursor before `dblclick` fires. */
export function createDeferredClick() {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let pendingKey: unknown = undefined;
  let doubledAt = -Infinity;
  const cancel = () => {
    if (timeoutId !== null) clearTimeout(timeoutId);
    timeoutId = null;
  };
  /** With `onDouble`, a second click on the same `key` while the first is pending runs it instead:
   * touch browsers don't reliably fire `dblclick` for a double-tap. */
  const schedule = (action: () => void, onDouble?: () => void, key?: unknown) => {
    if (onDouble && timeoutId !== null && key === pendingKey) {
      cancel();
      doubledAt = Date.now();
      onDouble();
      return;
    }
    cancel();
    pendingKey = key;
    timeoutId = setTimeout(() => {
      timeoutId = null;
      action();
    }, DOUBLE_CLICK_DELAY_MS);
  };
  /** The native `dblclick` handler: skipped when `schedule` already ran `onDouble` for this pair. */
  const doubleClick = (onDouble: () => void) => {
    cancel();
    if (Date.now() - doubledAt < DOUBLE_CLICK_DELAY_MS) return;
    onDouble();
  };
  return { schedule, cancel, doubleClick };
}
