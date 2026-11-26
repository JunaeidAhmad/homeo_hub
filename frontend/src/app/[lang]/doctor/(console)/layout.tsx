import type { ReactNode } from "react";

import { DoctorConsole } from "@/areas/doctor/DoctorConsole";

export default function DoctorConsoleLayout({ children }: { children: ReactNode }) {
  return <DoctorConsole>{children}</DoctorConsole>;
}
