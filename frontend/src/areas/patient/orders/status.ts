import type { components } from "@/api/schema";
import type { PatientMessages } from "@/i18n/messages/patient";

export type OrderStatus = components["schemas"]["OrderStatusEnum"];

export const ORDER_STATUS_META: Record<
  OrderStatus,
  { labelKey: keyof PatientMessages; badgeClass: string }
> = {
  PENDING_PAYMENT: {
    labelKey: "patient.orders.status.PENDING_PAYMENT",
    badgeClass: "bg-amber-wash text-ink",
  },
  CONFIRMED: {
    labelKey: "patient.orders.status.CONFIRMED",
    badgeClass: "bg-mist text-ink",
  },
  PAID: {
    labelKey: "patient.orders.status.PAID",
    badgeClass: "bg-mist text-ink",
  },
  PROCESSING: {
    labelKey: "patient.orders.status.PROCESSING",
    badgeClass: "bg-amber-wash text-ink",
  },
  SHIPPED: {
    labelKey: "patient.orders.status.SHIPPED",
    badgeClass: "bg-amber-wash text-ink",
  },
  DELIVERED: {
    labelKey: "patient.orders.status.DELIVERED",
    badgeClass: "bg-primary/15 text-primary-deep",
  },
  CANCELLED: {
    labelKey: "patient.orders.status.CANCELLED",
    badgeClass: "bg-mist text-danger",
  },
  RETURNED: {
    labelKey: "patient.orders.status.RETURNED",
    badgeClass: "bg-mist text-ink-muted",
  },
};
