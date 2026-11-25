import { useDescribeErrorWith } from "@/hooks/use-describe-error";
import { useSubmitWith } from "@/hooks/use-submit";

const FIELD_MESSAGES: Record<string, string> = {
  roles: "admin.error.roles",
};

/** Form state for admin screens, with the API's errors in admin wording. */
export function useAdminSubmit() {
  const describe = useDescribeErrorWith("admin", (field, code) => {
    if (code === "invalid" && (field === "username" || field === "slug")) {
      return `admin.error.${field}`;
    }
    return FIELD_MESSAGES[field];
  });
  return useSubmitWith(describe);
}
