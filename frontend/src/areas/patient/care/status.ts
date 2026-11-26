import type { components } from "@/api/schema";
import type { PatientMessages } from "@/i18n/messages/patient";

export type ConsultationStatus = components["schemas"]["ConsultationStatusEnum"];
export type ConsultationUrgency = components["schemas"]["UrgencyEnum"];
export type DurationUnit = components["schemas"]["DurationUnitEnum"];

export const CONSULTATION_STATUS_META: Record<
  ConsultationStatus,
  { labelKey: keyof PatientMessages; badgeClass: string }
> = {
  SUBMITTED: {
    labelKey: "patient.care.status.SUBMITTED",
    badgeClass: "bg-amber-wash text-ink",
  },
  ASSIGNED: {
    labelKey: "patient.care.status.ASSIGNED",
    badgeClass: "bg-mist text-ink",
  },
  IN_REVIEW: {
    labelKey: "patient.care.status.IN_REVIEW",
    badgeClass: "bg-mist text-ink",
  },
  AWAITING_PATIENT: {
    labelKey: "patient.care.status.AWAITING_PATIENT",
    badgeClass: "bg-amber-wash text-ink",
  },
  RESPONDED: {
    labelKey: "patient.care.status.RESPONDED",
    badgeClass: "bg-mist text-ink",
  },
  PRESCRIBED: {
    labelKey: "patient.care.status.PRESCRIBED",
    badgeClass: "bg-primary/15 text-primary-deep",
  },
  CLOSED: {
    labelKey: "patient.care.status.CLOSED",
    badgeClass: "bg-primary/15 text-primary-deep",
  },
  CANCELLED: {
    labelKey: "patient.care.status.CANCELLED",
    badgeClass: "bg-mist text-danger",
  },
};

export const URGENCY_BADGE: Record<ConsultationUrgency, string> = {
  ROUTINE: "bg-mist text-ink-soft",
  SOON: "bg-amber-wash text-ink",
  URGENT: "bg-mist text-danger",
};
