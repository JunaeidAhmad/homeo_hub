import { Suspense, type ReactNode } from "react";

import { AdminConsole } from "@/areas/admin/AdminConsole";
import { PageLoading } from "@/components/shell/PageLoading";

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  // The console and the pages under it read the URL, which [id] routes only know on request.
  return (
    <Suspense fallback={<PageLoading />}>
      <AdminConsole>{children}</AdminConsole>
    </Suspense>
  );
}
