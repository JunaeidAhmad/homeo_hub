import type { ReactNode } from "react";

/** Pinned bar at the bottom of a phone task screen; inline on desktop. */
export function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-line bg-surface px-4 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] desktop:static desktop:mx-0 desktop:border-0 desktop:bg-transparent desktop:px-0">
      {children}
    </div>
  );
}
