import { Link } from "wouter";

import type { FacetOption } from "@/lib/discovery";
import { discoveryUrl } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * Landing example chips (P0-6/UX): real expertise tags rendered as LINKS to
 * `/mentors?expertise=<tag>`, styled like an unselected FilterChip so the
 * results page shows the same chip selected. Rendered inside SearchIntent's
 * chip row (one scrollable line on mobile, wrapping on `md+`). On phones only
 * the first `mobileCount` are shown so the row reads as one line with a peek.
 */
export interface ExampleChipsProps {
  tags: FacetOption[];
  mobileCount?: number;
  /** Accessible name for the group. */
  label: string;
}

export const chipLinkClass =
  "inline-flex min-h-8 shrink-0 items-center whitespace-nowrap rounded-md border border-input bg-card px-3 py-1 text-body-sm font-medium text-secondary transition-colors duration-fast hover:bg-muted coarse:min-h-10";

export function ExampleChips({ tags, mobileCount = 3, label }: ExampleChipsProps) {
  if (tags.length === 0) return null;
  return (
    <nav aria-label={label} className="contents">
      {tags.map((tag, i) => (
        <Link
          key={tag.value}
          href={discoveryUrl({ expertise: [tag.value] })}
          className={cn(chipLinkClass, i >= mobileCount && "hidden md:inline-flex")}
          data-testid={`chip-example-${i}`}
        >
          {tag.label}
        </Link>
      ))}
    </nav>
  );
}
