import type { components } from "@/api/schema";
import type { PatientMessages } from "@/i18n/messages/patient";

export type PatientProfileData = components["schemas"]["PatientProfile"];
export type ProfileSectionKey =
  | "basic"
  | "family_history"
  | "medical_history"
  | "mental_picture"
  | "general_picture"
  | "likes_dislikes";

export const COMPLETENESS_ORDER: readonly (keyof PatientProfileData["completeness"]["sections"])[] = [
  "picture",
  "basic",
  "family_history",
  "medical_history",
  "mental_picture",
  "general_picture",
  "likes_dislikes",
];

export const PROFILE_SECTIONS: readonly {
  key: ProfileSectionKey;
  labelKey: keyof PatientMessages;
  preview: (p: PatientProfileData) => string;
}[] = [
  {
    key: "basic",
    labelKey: "patient.profile.section.basic",
    preview: (p) =>
      [
        p.blood_group,
        p.height_cm ? `${p.height_cm} cm` : "",
        p.weight_kg ? `${p.weight_kg} kg` : "",
        p.occupation,
      ]
        .filter(Boolean)
        .join(" · "),
  },
  {
    key: "family_history",
    labelKey: "patient.profile.section.family_history",
    preview: (p) => p.family_conditions || p.family_notes,
  },
  {
    key: "medical_history",
    labelKey: "patient.profile.section.medical_history",
    preview: (p) => p.chronic_conditions || p.current_medications || p.allergies,
  },
  {
    key: "mental_picture",
    labelKey: "patient.profile.section.mental_picture",
    preview: (p) => p.temperament || p.fears_anxieties || p.emotional_notes,
  },
  {
    key: "general_picture",
    labelKey: "patient.profile.section.general_picture",
    preview: (p) => p.appetite_thirst || p.sleep_dreams || p.general_notes,
  },
  {
    key: "likes_dislikes",
    labelKey: "patient.profile.section.likes_dislikes",
    preview: (p) => p.food_cravings || p.food_aversions || p.weather_modalities,
  },
];

export function isProfileSectionKey(value: string): value is ProfileSectionKey {
  return PROFILE_SECTIONS.some((section) => section.key === value);
}
