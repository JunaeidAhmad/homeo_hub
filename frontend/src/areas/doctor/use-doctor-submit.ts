import { useDescribeErrorWith } from "@/hooks/use-describe-error";
import { useSubmitWith } from "@/hooks/use-submit";

const FIELD_MESSAGES: Record<string, string> = {
  location_id: "doctor.error.location",
  experience_years: "doctor.error.experienceYears",
  requested_fee_poisha: "doctor.error.fee",
  consultation_fee_poisha: "doctor.error.fee",
};

/** Form state for doctor screens, with the API's errors in doctor wording. */
export function useDoctorSubmit() {
  const describe = useDescribeErrorWith("doctor", (field) => FIELD_MESSAGES[field]);
  return useSubmitWith(describe);
}
