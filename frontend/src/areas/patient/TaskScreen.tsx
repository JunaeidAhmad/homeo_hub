import type { ReactNode } from "react";

import { DisclaimerFooter } from "@/components/DisclaimerFooter";

import { ActionBar } from "./ActionBar";
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
        {/* Above the action bar, so the pinned action stays at the very bottom. */}
        <DisclaimerFooter />
        {action ? <ActionBar>{action}</ActionBar> : <div className="pb-8" />}
      </main>
    </div>
  );
}
