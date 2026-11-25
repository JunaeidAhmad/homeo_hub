import type { ReactNode } from "react";

import { AdminConsole } from "@/areas/admin/AdminConsole";

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return <AdminConsole>{children}</AdminConsole>;
}
