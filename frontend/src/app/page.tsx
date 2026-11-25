import { connection } from "next/server";
import { Suspense } from "react";

import { HealthStatus } from "@/components/HealthStatus";
import { getHealth } from "@/lib/health";

async function ApiHealth() {
  await connection(); // checked on every request, never prerendered
  return <HealthStatus health={await getHealth()} />;
}

export default function Home() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col gap-6 px-5 py-12">
      <header>
        <h1 className="text-3xl font-semibold text-[#164E3A]">HomeoHub</h1>
        <p className="mt-1 text-sm text-[#13241D]/70">Natural · Holistic · Healing · Cure</p>
      </header>
      <Suspense
        fallback={
          <p role="status" className="text-sm">
            Checking the API…
          </p>
        }
      >
        <ApiHealth />
      </Suspense>
    </main>
  );
}
