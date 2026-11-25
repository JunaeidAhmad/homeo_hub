import type { ReactNode } from "react";

import { TabBar } from "@/areas/patient/TabBar";
import { TopBar } from "@/areas/patient/TopBar";

/** Browse pages (Home, Remedies, My care, Orders, Profile): top bar + bottom tab bar. */
export default function BrowseLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar />
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 desktop:px-6 desktop:py-12">
        {children}
      </main>
      <TabBar />
    </div>
  );
}
