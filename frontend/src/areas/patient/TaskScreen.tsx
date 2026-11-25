import type { ReactNode } from "react";

import { TopBar } from "./TopBar";

/**
 * A patient task page (cart, checkout, a prescription...): back arrow and title on
 * top, and the page's one main action pinned to the bottom on a phone.
 */
export function TaskScreen({
  title,
  backHref,
  action,
  children,
}: {
  title: string;
  backHref: string;
  /** Pages that only show something have none. */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar task={{ title, backHref }} />
      <main className="mx-auto flex w-full max-w-[820px] flex-1 flex-col px-4 pt-6 desktop:px-6 desktop:pt-10">
        <div className="flex-1">{children}</div>
        {action ? (
          <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-line bg-surface px-4 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] desktop:static desktop:mx-0 desktop:border-0 desktop:bg-transparent desktop:px-0">
            {action}
          </div>
        ) : (
          <div className="pb-8" />
        )}
      </main>
    </div>
  );
}
