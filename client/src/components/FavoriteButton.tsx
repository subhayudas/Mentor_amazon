import * as React from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Heart } from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { useFavorites } from "@/lib/favorites";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * Heart toggle for one mentor. A signed-in mentee saves / removes the mentor;
 * anyone else is taken to the mentee registration (with the profile as the
 * return path). Sits above the card's link overlay (`relative z-[2]`).
 */
export function FavoriteButton({ mentorId, mentorName, className, size = "md" }: { mentorId: string; mentorName: string; className?: string; size?: "sm" | "md" }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const menteeId = user?.user_type === "mentee" ? user.profile_id ?? null : null;
  const { isFavorite, toggle, canFavorite } = useFavorites(menteeId, user?.name);
  const on = canFavorite && isFavorite(mentorId);
  const label = on ? t("showcase.favorites.remove", { name: mentorName }) : t("showcase.favorites.add", { name: mentorName });

  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      title={label}
      data-testid={`button-favorite-${mentorId}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!canFavorite) {
          navigate(`${ROUTES.menteeRegistration}?next=${encodeURIComponent(ROUTES.mentor(mentorId))}`);
          return;
        }
        toggle.mutate({ mentorId, mentorName });
      }}
      className={cn(
        "relative z-[2] inline-flex items-center justify-center rounded-full border bg-white text-[var(--sc-ink)] transition-colors duration-fast hover:border-[var(--sc-ink)]",
        size === "sm" ? "size-9" : "size-11",
        on ? "border-[#d5534d] text-[#d5534d]" : "border-[#e3e8ed]",
        className,
      )}
    >
      <Heart className={cn(size === "sm" ? "size-4" : "size-5", on && "fill-current")} aria-hidden="true" />
    </button>
  );
}
