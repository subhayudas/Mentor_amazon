import { SearchX } from "lucide-react";
import { useTranslation } from "react-i18next";

import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";

/**
 * Zero-result state (spec §5, P2-7, F-27): names the query and/or the filters
 * (the active constraints sit right above it as removable chips) and says
 * what to change for THIS case:
 * - query only → "Try a broader term, or search by skill" + one button "Clear search";
 * - filters only → "Try fewer filters." + one button "Clear filters";
 * - both → "Try fewer filters or a broader search term." + "Clear filters"
 *   (keeps the query) and a text link "Search everything instead" (clears the query).
 */
export interface ZeroResultsProps {
  query: string;
  hasFilters: boolean;
  onClearFilters: () => void;
  onClearQuery: () => void;
}

export function ZeroResults({ query, hasFilters, onClearFilters, onClearQuery }: ZeroResultsProps) {
  const { t } = useTranslation();
  const q = query.trim();
  const both = Boolean(q) && hasFilters;
  const title = both
    ? t("discovery.zero.titleBoth", { q })
    : q
      ? t("discovery.zero.titleQuery", { q })
      : t("discovery.zero.titleFilters");
  const body = both ? t("discovery.zero.body") : q ? t("discovery.zero.bodyQuery") : t("discovery.zero.bodyFilters");

  return (
    <EmptyState
      role="status"
      icon={SearchX}
      titleAs="h3"
      title={title}
      description={body}
      data-testid="zero-results"
      action={
        hasFilters ? (
          <Button type="button" variant="outline" onClick={onClearFilters} data-testid="button-zero-clear-filters">
            {t("discovery.zero.clearFilters")}
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={onClearQuery} data-testid="button-zero-clear-search">
            {t("discovery.zero.clearSearch")}
          </Button>
        )
      }
      secondaryAction={
        both ? (
          <Button type="button" variant="link" onClick={onClearQuery}>
            {t("discovery.zero.searchAll")}
          </Button>
        ) : undefined
      }
    />
  );
}
