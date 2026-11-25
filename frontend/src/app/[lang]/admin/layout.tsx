import type { ReactNode } from "react";

import { ADMIN_NAV } from "@/areas/admin/nav";
import { StaffLayout } from "@/components/shell/StaffLayout";
import { admin } from "@/i18n/messages/admin";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <StaffLayout catalog={admin} areaNameKey="admin.area" nav={ADMIN_NAV}>
      {children}
    </StaffLayout>
  );
}
