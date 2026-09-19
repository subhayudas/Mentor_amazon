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

/** The same link inside a destructive alert. */
export const textLinkDestructiveClass = `${textLinkBase} text-destructive`;
