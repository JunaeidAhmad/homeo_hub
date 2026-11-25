"use client";

import { useState } from "react";

import type { components } from "@/api/schema";
import { LocationPicker } from "@/components/LocationPicker";

/** "Your area" field for the patient's profile (saved once profiles exist, ticket 15). */
export function AreaField() {
  const [area, setArea] = useState<components["schemas"]["Location"] | null>(null);
  return <LocationPicker value={area} onChange={setArea} />;
}
