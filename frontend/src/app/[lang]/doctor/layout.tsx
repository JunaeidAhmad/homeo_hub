import type { ReactNode } from "react";

import { DOCTOR_NAV } from "@/areas/doctor/nav";
import { StaffLayout } from "@/components/shell/StaffLayout";
import { doctor } from "@/i18n/messages/doctor";

export default function DoctorLayout({ children }: { children: ReactNode }) {
  return (
    <StaffLayout catalog={doctor} areaNameKey="doctor.area" nav={DOCTOR_NAV}>
      {children}
    </StaffLayout>
  );
}
