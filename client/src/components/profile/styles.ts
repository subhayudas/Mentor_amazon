import { clsx, type ClassValue } from "clsx";

/**
 * Shared class strings for the profile and booking surfaces.
 *
 * `cx` joins classes WITHOUT tailwind-merge: `cn()` treats the type-role
 * classes (`text-caption`, `text-body-sm`, `text-h2`…) as text colours and
 * drops one of them whenever a colour class follows, so any element that
 * needs both a role and a colour goes through `cx` here.
 */
export const cx = (...inputs: ClassValue[]) => clsx(inputs);

const textLinkBase =
  "inline-flex min-h-8 items-center gap-1 rounded-sm text-body-sm font-medium underline decoration-1 underline-offset-4 transition-colors duration-fast hover:decoration-2 coarse:min-h-11";

/** Text links are always underlined (navy alone is not a cue), on a >= 32px line box, 44px on touch. */
export const textLinkClass = `${textLinkBase} text-secondary`;

/** A link inside running text: underlined, same line height as its sentence. */
export const inlineLinkClass =
  "rounded-sm font-medium text-secondary underline decoration-1 underline-offset-4 transition-colors duration-fast hover:decoration-2";

/** The same link inside a destructive alert. */
export const textLinkDestructiveClass = `${textLinkBase} text-destructive`;

// ---------------------------------------------------------------------------
// Layout constants shared by MentorProfile, ProfileHeader, RequestRailCard and
// ProfileSkeleton so the skeleton has the loaded page's geometry (F-31).
// ---------------------------------------------------------------------------

/** The back-link row: a 32px line box above the header block. */
export const backLinkRowClass = "mt-6 inline-flex min-h-8 items-center gap-1";

/** Avatar + header block under the back link. */
export const headerRowClass = "mt-8 flex items-start gap-4 sm:gap-6";

/** The two-column grid: sections on the start side, the 336px card on `lg+`. */
export const profileGridClass = "mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_336px] lg:gap-12";

/** The request card surface: white, radius 12, p-6 (P1-17). */
export const profileCardClass = "rounded-xl border border-border bg-card p-6";
