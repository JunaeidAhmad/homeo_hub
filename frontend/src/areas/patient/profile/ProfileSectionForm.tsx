"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import type { components } from "@/api/schema";
import { TaskScreen } from "@/areas/patient/TaskScreen";
import { useSession } from "@/areas/patient/session/SessionProvider";
import { LocationPicker } from "@/components/LocationPicker";
import {
  FormAlert,
  SegmentedChoice,
  SubmitBar,
  TextAreaField,
  TextField,
} from "@/components/form/fields";
import { useDescribeErrorWith } from "@/hooks/use-describe-error";
import { useSubmitWith } from "@/hooks/use-submit";
import type { PatientMessages } from "@/i18n/messages/patient";
import { useMessages } from "@/i18n/provider";
import { toAsciiDigits } from "@/lib/digits";

import {
  isProfileSectionKey,
  PROFILE_SECTIONS,
  type PatientProfileData,
  type ProfileSectionKey,
} from "./sections";

type Location = components["schemas"]["Location"];
type Gender = components["schemas"]["GenderEnum"];
type BloodGroup = components["schemas"]["BloodGroupEnum"];
type MaritalStatus = components["schemas"]["MaritalStatusEnum"];
type ThermalPref = components["schemas"]["ThermalPreferenceEnum"];

const BLOOD_GROUPS: readonly BloodGroup[] = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const MARITAL_STATUSES: readonly MaritalStatus[] = ["SINGLE", "MARRIED", "WIDOWED", "DIVORCED"];

function SectionFormInner({
  section,
  profile,
  onSaved,
}: {
  section: ProfileSectionKey;
  profile: PatientProfileData;
  onSaved: (next: PatientProfileData) => void;
}) {
  const { t } = useMessages<PatientMessages>();
  const { api } = useSession();
  const describe = useDescribeErrorWith("patient", (field) => {
    if (field === "age") return "patient.error.age";
    if (field === "height_cm") return "patient.error.heightCm";
    if (field === "weight_kg") return "patient.error.weightKg";
    if (field === "location_id") return "patient.error.location";
    return undefined;
  });
  const { pending, problems, setProblems, submit } = useSubmitWith(describe);
  const [savedNotice, setSavedNotice] = useState(false);

  // Basic state
  const [fullName, setFullName] = useState(profile.full_name);
  const [ageText, setAgeText] = useState(String(profile.age));
  const [gender, setGender] = useState<Gender>(profile.gender);
  const [location, setLocation] = useState<Location | null>(profile.location);
  const [bloodGroup, setBloodGroup] = useState<string>(profile.blood_group || "");
  const [heightText, setHeightText] = useState(
    profile.height_cm !== null ? String(profile.height_cm) : "",
  );
  const [weightText, setWeightText] = useState(profile.weight_kg ?? "");
  const [maritalStatus, setMaritalStatus] = useState<string>(profile.marital_status || "");
  const [occupation, setOccupation] = useState(profile.occupation);

  // Clinical states
  const [familyConditions, setFamilyConditions] = useState(profile.family_conditions);
  const [familyNotes, setFamilyNotes] = useState(profile.family_notes);
  const [chronicConditions, setChronicConditions] = useState(profile.chronic_conditions);
  const [currentMedications, setCurrentMedications] = useState(profile.current_medications);
  const [allergies, setAllergies] = useState(profile.allergies);
  const [temperament, setTemperament] = useState(profile.temperament);
  const [fearsAnxieties, setFearsAnxieties] = useState(profile.fears_anxieties);
  const [emotionalNotes, setEmotionalNotes] = useState(profile.emotional_notes);
  const [thermalPref, setThermalPref] = useState<string>(profile.thermal_preference || "");
  const [appetiteThirst, setAppetiteThirst] = useState(profile.appetite_thirst);
  const [sleepDreams, setSleepDreams] = useState(profile.sleep_dreams);
  const [generalNotes, setGeneralNotes] = useState(profile.general_notes);
  const [foodCravings, setFoodCravings] = useState(profile.food_cravings);
  const [foodAversions, setFoodAversions] = useState(profile.food_aversions);
  const [weatherModalities, setWeatherModalities] = useState(profile.weather_modalities);

  function saveBasic(event: FormEvent) {
    event.preventDefault();
    setSavedNotice(false);
    const fields: Record<string, string> = {};
    const parsedAge = Number(toAsciiDigits(ageText).trim());
    if (!fullName.trim()) fields.full_name = t("patient.error.required");
    if (!ageText.trim() || !Number.isInteger(parsedAge) || parsedAge < 1 || parsedAge > 120) {
      fields.age = t("patient.error.age");
    }
    if (!location) fields.location_id = t("patient.error.location");

    const trimmedHeight = toAsciiDigits(heightText).trim();
    let parsedHeight: number | null = null;
    if (trimmedHeight) {
      parsedHeight = Number(trimmedHeight);
      if (!Number.isInteger(parsedHeight) || parsedHeight < 30 || parsedHeight > 250) {
        fields.height_cm = t("patient.error.heightCm");
      }
    }

    const trimmedWeight = toAsciiDigits(weightText).trim();
    if (trimmedWeight) {
      const parsedWeight = Number(trimmedWeight);
      if (!Number.isFinite(parsedWeight) || parsedWeight < 1 || parsedWeight > 300) {
        fields.weight_kg = t("patient.error.weightKg");
      }
    }

    if (Object.keys(fields).length > 0 || !location) {
      setProblems({ fields });
      return;
    }

    void submit(
      () =>
        api.PATCH("/api/v1/me/profile/basic/", {
          body: {
            full_name: fullName.trim(),
            age: parsedAge,
            gender,
            location_id: location.id,
            blood_group: (bloodGroup || "") as BloodGroup,
            height_cm: parsedHeight,
            weight_kg: trimmedWeight || null,
            marital_status: (maritalStatus || "") as MaritalStatus,
            occupation: occupation.trim(),
          },
        }),
      (next) => {
        onSaved(next);
        setSavedNotice(true);
      },
    );
  }

  function saveClinical(event: FormEvent) {
    event.preventDefault();
    setSavedNotice(false);
    const payloads: Record<Exclude<ProfileSectionKey, "basic">, Record<string, string>> = {
      family_history: {
        family_conditions: familyConditions,
        family_notes: familyNotes,
      },
      medical_history: {
        chronic_conditions: chronicConditions,
        current_medications: currentMedications,
        allergies,
      },
      mental_picture: {
        temperament,
        fears_anxieties: fearsAnxieties,
        emotional_notes: emotionalNotes,
      },
      general_picture: {
        thermal_preference: thermalPref,
        appetite_thirst: appetiteThirst,
        sleep_dreams: sleepDreams,
        general_notes: generalNotes,
      },
      likes_dislikes: {
        food_cravings: foodCravings,
        food_aversions: foodAversions,
        weather_modalities: weatherModalities,
      },
    };
    const key = section as Exclude<ProfileSectionKey, "basic">;
    void submit(
      () =>
        api.PATCH("/api/v1/me/profile/sections/{key}/", {
          params: { path: { key } },
          body: payloads[key] as never,
        }),
      (next) => {
        onSaved(next);
        setSavedNotice(true);
      },
    );
  }

  return (
    <form
      onSubmit={section === "basic" ? saveBasic : saveClinical}
      noValidate
      className="flex flex-1 flex-col gap-5"
    >
      {problems.form && <FormAlert>{problems.form}</FormAlert>}
      {savedNotice && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-primary/40 bg-mist px-4 py-3 text-sm font-semibold text-primary-deep"
        >
          <span>{t("patient.profile.saved")}</span>
          <Link href="/profile" className="underline">
            {t("patient.profile.back")}
          </Link>
        </div>
      )}

      {section === "basic" && (
        <>
          <TextField
            label={t("patient.profile.fullName")}
            error={problems.fields.full_name}
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            maxLength={120}
          />
          <TextField
            label={t("patient.profile.age")}
            error={problems.fields.age}
            value={ageText}
            onChange={(event) => setAgeText(event.target.value)}
            inputMode="numeric"
            maxLength={3}
          />
          <SegmentedChoice
            legend={t("patient.profile.gender")}
            name="gender"
            value={gender}
            onChange={setGender}
            options={[
              { value: "FEMALE", label: t("patient.profile.gender.FEMALE") },
              { value: "MALE", label: t("patient.profile.gender.MALE") },
              { value: "OTHER", label: t("patient.profile.gender.OTHER") },
            ]}
          />
          <LocationPicker
            value={location}
            onChange={setLocation}
            error={problems.fields.location_id}
          />

          <div className="grid gap-5 desktop:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="blood-group" className="text-[15px] font-semibold">
                {t("patient.profile.bloodGroup")}
              </label>
              <select
                id="blood-group"
                value={bloodGroup}
                onChange={(event) => setBloodGroup(event.target.value)}
                className="min-h-13 rounded-control border border-line-strong bg-surface px-3.5 text-[17px]"
              >
                <option value="">{t("patient.profile.noneOption")}</option>
                {BLOOD_GROUPS.map((bg) => (
                  <option key={bg} value={bg}>
                    {bg}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="marital-status" className="text-[15px] font-semibold">
                {t("patient.profile.maritalStatus")}
              </label>
              <select
                id="marital-status"
                value={maritalStatus}
                onChange={(event) => setMaritalStatus(event.target.value)}
                className="min-h-13 rounded-control border border-line-strong bg-surface px-3.5 text-[17px]"
              >
                <option value="">{t("patient.profile.noneOption")}</option>
                {MARITAL_STATUSES.map((ms) => (
                  <option key={ms} value={ms}>
                    {t(`patient.profile.marital.${ms}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-5 desktop:grid-cols-2">
            <TextField
              label={t("patient.profile.heightCm")}
              error={problems.fields.height_cm}
              value={heightText}
              onChange={(event) => setHeightText(event.target.value)}
              inputMode="numeric"
              maxLength={3}
            />
            <TextField
              label={t("patient.profile.weightKg")}
              error={problems.fields.weight_kg}
              value={weightText}
              onChange={(event) => setWeightText(event.target.value)}
              inputMode="decimal"
              maxLength={6}
            />
          </div>

          <TextField
            label={t("patient.profile.occupation")}
            value={occupation}
            onChange={(event) => setOccupation(event.target.value)}
            maxLength={120}
          />
        </>
      )}

      {section === "family_history" && (
        <>
          <TextAreaField
            label={t("patient.profile.familyConditions")}
            hint={t("patient.profile.familyConditionsHint")}
            value={familyConditions}
            onChange={(event) => setFamilyConditions(event.target.value)}
            maxLength={4000}
          />
          <TextAreaField
            label={t("patient.profile.familyNotes")}
            value={familyNotes}
            onChange={(event) => setFamilyNotes(event.target.value)}
            maxLength={4000}
          />
        </>
      )}

      {section === "medical_history" && (
        <>
          <TextAreaField
            label={t("patient.profile.chronicConditions")}
            hint={t("patient.profile.chronicConditionsHint")}
            value={chronicConditions}
            onChange={(event) => setChronicConditions(event.target.value)}
            maxLength={4000}
          />
          <TextAreaField
            label={t("patient.profile.currentMedications")}
            value={currentMedications}
            onChange={(event) => setCurrentMedications(event.target.value)}
            maxLength={4000}
          />
          <TextAreaField
            label={t("patient.profile.allergies")}
            value={allergies}
            onChange={(event) => setAllergies(event.target.value)}
            maxLength={4000}
          />
        </>
      )}

      {section === "mental_picture" && (
        <>
          <TextAreaField
            label={t("patient.profile.temperament")}
            hint={t("patient.profile.temperamentHint")}
            value={temperament}
            onChange={(event) => setTemperament(event.target.value)}
            maxLength={4000}
          />
          <TextAreaField
            label={t("patient.profile.fearsAnxieties")}
            value={fearsAnxieties}
            onChange={(event) => setFearsAnxieties(event.target.value)}
            maxLength={4000}
          />
          <TextAreaField
            label={t("patient.profile.emotionalNotes")}
            value={emotionalNotes}
            onChange={(event) => setEmotionalNotes(event.target.value)}
            maxLength={4000}
          />
        </>
      )}

      {section === "general_picture" && (
        <>
          <SegmentedChoice
            legend={t("patient.profile.thermalPreference")}
            name="thermal_preference"
            value={(thermalPref || null) as ThermalPref | null}
            onChange={(next) => setThermalPref(next)}
            options={[
              { value: "CHILLY" as ThermalPref, label: t("patient.profile.thermal.CHILLY") },
              { value: "HOT" as ThermalPref, label: t("patient.profile.thermal.HOT") },
              { value: "AMBIVALENT" as ThermalPref, label: t("patient.profile.thermal.AMBIVALENT") },
            ]}
          />
          <TextAreaField
            label={t("patient.profile.appetiteThirst")}
            hint={t("patient.profile.appetiteThirstHint")}
            value={appetiteThirst}
            onChange={(event) => setAppetiteThirst(event.target.value)}
            maxLength={4000}
          />
          <TextAreaField
            label={t("patient.profile.sleepDreams")}
            value={sleepDreams}
            onChange={(event) => setSleepDreams(event.target.value)}
            maxLength={4000}
          />
          <TextAreaField
            label={t("patient.profile.generalNotes")}
            hint={t("patient.profile.generalNotesHint")}
            value={generalNotes}
            onChange={(event) => setGeneralNotes(event.target.value)}
            maxLength={4000}
          />
        </>
      )}

      {section === "likes_dislikes" && (
        <>
          <TextAreaField
            label={t("patient.profile.foodCravings")}
            hint={t("patient.profile.foodCravingsHint")}
            value={foodCravings}
            onChange={(event) => setFoodCravings(event.target.value)}
            maxLength={4000}
          />
          <TextAreaField
            label={t("patient.profile.foodAversions")}
            value={foodAversions}
            onChange={(event) => setFoodAversions(event.target.value)}
            maxLength={4000}
          />
          <TextAreaField
            label={t("patient.profile.weatherModalities")}
            hint={t("patient.profile.weatherModalitiesHint")}
            value={weatherModalities}
            onChange={(event) => setWeatherModalities(event.target.value)}
            maxLength={4000}
          />
        </>
      )}

      <SubmitBar pending={pending}>{t("patient.profile.save")}</SubmitBar>
    </form>
  );
}

export function ProfileSectionForm({ section }: { section: string }) {
  const { t } = useMessages<PatientMessages>();
  const session = useSession();
  const { api } = session;
  const [profile, setProfile] = useState<PatientProfileData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const valid = isProfileSectionKey(section);
  const meta = PROFILE_SECTIONS.find((item) => item.key === section);
  const title = meta ? t(meta.labelKey) : t("patient.profile.title");

  useEffect(() => {
    if (session.status !== "signedIn" || !valid) return;
    const controller = new AbortController();
    api
      .GET("/api/v1/me/profile/", { signal: controller.signal })
      .then(({ data }) => {
        if (data) {
          setProfile(data);
          setLoadFailed(false);
        } else {
          setLoadFailed(true);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadFailed(true);
      });
    return () => controller.abort();
  }, [api, session.status, valid]);

  if (!valid) {
    return (
      <TaskScreen title={title} backHref="/profile">
        <FormAlert>{t("patient.profile.notFound")}</FormAlert>
      </TaskScreen>
    );
  }

  const isGuest =
    session.status === "signedOut" || (session.status === "unavailable" && !session.hasSession);

  if (isGuest) {
    return (
      <TaskScreen title={title} backHref="/profile">
        <div className="flex flex-col items-center gap-4 rounded-panel border border-line bg-surface p-6 text-center">
          <p className="text-base text-ink-soft">{t("patient.profile.guest")}</p>
          <Link
            href={`/signin?next=/profile/${section}`}
            className="flex min-h-13 items-center justify-center rounded-control bg-primary px-6 font-bold text-surface"
          >
            {t("patient.cart.signIn")}
          </Link>
        </div>
      </TaskScreen>
    );
  }

  return (
    <TaskScreen title={title} backHref="/profile">
      {loadFailed ? (
        <FormAlert>{t("patient.error.generic")}</FormAlert>
      ) : !profile ? (
        <p role="status" className="text-ink-muted">
          …
        </p>
      ) : (
        <SectionFormInner
          key={`${profile.updated_at}:${section}`}
          section={section}
          profile={profile}
          onSaved={setProfile}
        />
      )}
    </TaskScreen>
  );
}
