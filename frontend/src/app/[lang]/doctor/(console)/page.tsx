import { DoctorQueue } from "@/areas/doctor/DoctorQueue";

// The portal layout holds pages back until the browser has checked who is signed in, so the
// server never renders this one and Next.js cannot check it for instant navigation.
export const instant = false;

export default function DoctorHomePage() {
  return <DoctorQueue />;
}
