import { AuthScreen } from "@/areas/patient/auth/AuthScreen";
import { SignUpForm } from "@/areas/patient/auth/SignUpForm";

export default function Page() {
  return (
    <AuthScreen>
      <SignUpForm />
    </AuthScreen>
  );
}
