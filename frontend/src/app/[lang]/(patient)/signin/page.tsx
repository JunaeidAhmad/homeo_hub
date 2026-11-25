import { AuthScreen } from "@/areas/patient/auth/AuthScreen";
import { SignInForm } from "@/areas/patient/auth/SignInForm";

export default function Page() {
  return (
    <AuthScreen>
      <SignInForm />
    </AuthScreen>
  );
}
