import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import type { PublicMentor } from "@/lib/database";

/** `mentorship_preference` → one honest sentence; the only public "session framing" field. */
export function preferenceLabel(preference: PublicMentor["mentorship_preference"], t: TFunction): string | null {
  switch (preference) {
    case "ongoing":
      return t("mentorProfile.preference.ongoing");
    case "rotating":
      return t("mentorProfile.preference.rotating");
    case "either":
      return t("mentorProfile.preference.either");
    default:
      return null;
  }
}

/** "Session style" — one body-sm line; nothing when the field is empty. */
export function SessionStyle({ preference }: { preference: PublicMentor["mentorship_preference"] }) {
  const { t } = useTranslation();
  const label = preferenceLabel(preference, t);
  if (!label) return null;
  return (
    <section aria-labelledby="profile-session-style">
      <h2 id="profile-session-style" className="text-h2-sm text-foreground md:text-h2">
        {t("mentorProfile.sessionStyle")}
      </h2>
      <p className="mt-2 text-body-sm text-foreground">{label}</p>
    </section>
  );
}
