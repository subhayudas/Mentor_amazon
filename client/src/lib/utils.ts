import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * `cn` = clsx + tailwind-merge. The merge config is taught the project's
 * custom theme steps so it can tell a type role from a text colour: without
 * this, `text-caption` / `text-body-sm` / `text-h3` … are classified as
 * colours and dropped whenever a `text-<colour>` class follows (and the
 * colour is dropped when the role follows), so badges, credential lines and
 * dialog titles silently lose their size. Named durations and easings are
 * listed for the same reason.
 */
const TYPE_ROLES = ["display", "display-sm", "h1", "h1-sm", "h2", "h2-sm", "h3", "body", "body-sm", "caption"]

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: TYPE_ROLES }],
      duration: [{ duration: ["fast", "base", "slow", "140", "180"] }],
      ease: [{ ease: ["out", "in-out", "drawer"] }],
      shadow: [{ shadow: ["sm", "elevated"] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
