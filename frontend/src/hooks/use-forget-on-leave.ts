import { useEffect, useEffectEvent } from "react";

/**
 * Next keeps a page alive (hidden) after you navigate away, so typed secrets would
 * still be there on return. Effects are cleaned up when a page is hidden: forget then.
 */
export function useForgetOnLeave(forget: () => void) {
  const onLeave = useEffectEvent(forget);
  useEffect(() => () => onLeave(), []);
}
