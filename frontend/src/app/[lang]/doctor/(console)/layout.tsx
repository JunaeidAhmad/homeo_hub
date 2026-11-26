import { Suspense, type ReactNode } from "react";

import { DoctorConsole } from "@/areas/doctor/DoctorConsole";
import { PageLoading } from "@/components/shell/PageLoading";

export default function DoctorConsoleLayout({ children }: { children: ReactNode }) {
  // The console and the pages under it read the URL, which [id] routes only know on request.
  return (
    <Suspense fallback={<PageLoading />}>
      <DoctorConsole>{children}</DoctorConsole>
    </Suspense>
  );
}
