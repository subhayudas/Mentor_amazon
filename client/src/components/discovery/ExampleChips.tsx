import { Link } from "wouter";

import { Skeleton } from "@/components/ui/skeleton";
import { EXAMPLE_CHIP_LIMIT, type FacetOption } from "@/lib/discovery";
import { discoveryUrl } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * Landing example chips (P0-6/UX): real expertise tags rendered as LINKS to
 * `/mentors?expertise=<tag>`, styled like an unselected FilterChip so the
 * results page shows the same chip selected. Rendered inside SearchIntent's
 * chip row: on `md+` the four chips (`EXAMPLE_CHIP_LIMIT`) sit on ONE line in
 * the hero column; on phones the first `mobileCount` run in the row's snap
 * scroller, which bleeds to the viewport edge so the chip that does not fit
 * peeks past the gutter instead of clipping at it (F-24). The skeleton renders
 * the same count and row height, so the tags arriving never moves what sits
 * below the search box (F-06, P1-16).
 */
export const EXAMPLE_CHIP_MOBILE_COUNT = 3;

export interface ExampleChipsProps {
  tags: FacetOption[];
  mobileCount?: number;
  /** Accessible name for the group. */
  label: string;
}

export const chipLinkClass =
  // Fixed `h-8` (40 on touch), not `min-h` + padding: the Arabic line-height is
  // taller than the Latin one, so a padded chip would be 34px in AR while the
  // skeleton pill stays 32 — a 2px shift on arrival (F-06).
  "inline-flex h-8 shrink-0 snap-start items-center whitespace-nowrap rounded-md border border-input bg-card px-3 text-body-sm font-medium text-secondary transition-colors duration-fast hover:bg-muted coarse:h-10";

export function ExampleChips({ tags, mobileCount = EXAMPLE_CHIP_MOBILE_COUNT, label }: ExampleChipsProps) {
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

/**
 * Holds the chip row's height while the catalogue loads (P1-16: nothing
 * below the search box shifts when the tags arrive): the same count as the
 * loaded row (`EXAMPLE_CHIP_LIMIT`, `mobileCount` on phones) at typical tag
 * widths. Decorative.
 */
export function ExampleChipsSkeleton({
  count = EXAMPLE_CHIP_LIMIT,
  mobileCount = EXAMPLE_CHIP_MOBILE_COUNT,
}: {
  count?: number;
  mobileCount?: number;
}) {
  const widths = ["w-36", "w-44", "w-24", "w-16", "w-28"];
  return (
    <div aria-hidden="true" className="contents">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton
          key={i}
          className={cn("h-8 shrink-0 snap-start rounded-md coarse:h-10", widths[i % widths.length], i >= mobileCount && "hidden md:block")}
        />
      ))}
    </div>
  );
}
