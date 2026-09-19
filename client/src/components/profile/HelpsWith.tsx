import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { formatList } from "@/components/profile/localized";
import { bidi } from "@/lib/format";

/**
 * "What I can help with": expertise as neutral chips, then industries as one
 * body-sm line. Renders nothing when the mentor has neither (the mentor-facing
 * "consult your job family" hint never renders publicly).
 */
export function HelpsWith({ expertise, industries }: { expertise: string[]; industries: string[] }) {
  const { t, i18n } = useTranslation();
  if (expertise.length === 0 && industries.length === 0) return null;
  return (
    <section aria-labelledby="profile-helps-with">
      <h2 id="profile-helps-with" className="text-h2-sm text-foreground md:text-h2">
        {t("mentorProfile.helpsWith")}
      </h2>
      {expertise.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {expertise.map((tag) => (
            <li key={tag} className="min-w-0 text-caption">
              <Badge tone="neutral" className="whitespace-normal">
                {tag}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      {industries.length > 0 && (
        <p className="mt-3 text-body-sm text-muted-foreground">
          {t("mentorProfile.industriesLine", { list: bidi(formatList(industries, i18n.language)) })}
        </p>
      )}
    </section>
  );
}
