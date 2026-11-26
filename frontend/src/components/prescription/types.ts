import type { components } from "@/api/schema";

export type RemedyForm = components["schemas"]["FormEnum"];
export type Potency = components["schemas"]["PotenciesEnum"];
export type AdviceKind = components["schemas"]["AdviceKindEnum"];

export type PrescriptionDoctorInfo = {
  full_name: string;
  registration_no: string;
  doctor_code?: string | null;
  qualifications?: string;
};

export type PrescriptionSheetItem = {
  id?: string;
  remedy_name: string;
  remedy_name_bn?: string;
  is_catalog: boolean;
  potency: Potency;
  form: RemedyForm;
  dosage: string;
  frequency: string;
  duration: string;
  unavailable_reason?: "NOT_LISTED" | "NO_PRICE" | null;
};

export type PrescriptionSheetAdvice = {
  kind: AdviceKind;
  text: string;
};

export type PrescriptionSheetData = {
  doctor: PrescriptionDoctorInfo;
  version?: number;
  issued_at: string;
  report_after_date?: string | null;
  items: PrescriptionSheetItem[];
  advice: PrescriptionSheetAdvice[];
};

export type PrescriptionSheetLabels = {
  formLabel: Record<RemedyForm, string>;
  notSoldHere: string;
  currentlyUnavailable: string;
  doTitle: string;
  dontTitle: string;
  reportAfter: (date: string) => string;
  versionLabel?: (version: number) => string;
  regNoPrefix: string;
  signatureLabel: string;
};

export type SealedSheetLabels = {
  sealedNotice: string;
  remedyCount: (count: number) => string;
  doctorFee: string;
  platformFee: string;
  total: string;
};
