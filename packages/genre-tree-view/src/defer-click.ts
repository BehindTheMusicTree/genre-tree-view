import { DOUBLE_CLICK_DELAY_MS } from "./constants";

/** Runs a click's action only once no second click follows, so the pan/zoom glide it starts can't
 * move the target out from under the cursor before `dblclick` fires. */
export function createDeferredClick() {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const cancel = () => {
    if (timeoutId !== null) clearTimeout(timeoutId);
    timeoutId = null;
  };
  const schedule = (action: () => void) => {
    cancel();
    timeoutId = setTimeout(() => {
      timeoutId = null;
      action();
    }, DOUBLE_CLICK_DELAY_MS);
  };
  return { schedule, cancel };
}
