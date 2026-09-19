import { SearchX } from "lucide-react";
import { useTranslation } from "react-i18next";

import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";

/**
 * Zero-result state (spec §5, P2-7): names the query and/or the filters
 * (the active constraints sit right above it as removable chips), then one
 * button "Clear filters" (keeps the query) and, when a query is set, a text
 * link "Search everything instead" (clears the query). With a query and no
 * filters the link becomes the single button.
 */
export interface ZeroResultsProps {
  query: string;
  hasFilters: boolean;
  onClearFilters: () => void;
  onSearchAll: () => void;
}

export function ZeroResults({ query, hasFilters, onClearFilters, onSearchAll }: ZeroResultsProps) {
  const { t } = useTranslation();
  const q = query.trim();
  const title =
    q && hasFilters
      ? t("discovery.zero.titleBoth", { q })
      : q
        ? t("discovery.zero.titleQuery", { q })
        : t("discovery.zero.titleFilters");

  return (
    <EmptyState
      role="status"
      icon={SearchX}
      titleAs="h3"
      title={title}
      description={t("discovery.zero.body")}
      data-testid="zero-results"
      action={
        hasFilters ? (
          <Button type="button" variant="outline" onClick={onClearFilters} data-testid="button-zero-clear-filters">
            {t("discovery.zero.clearFilters")}
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={onSearchAll}>
            {t("discovery.zero.searchAll")}
          </Button>
        )
      }
      secondaryAction={
        q && hasFilters ? (
          <Button type="button" variant="link" onClick={onSearchAll}>
            {t("discovery.zero.searchAll")}
          </Button>
        ) : undefined
      }
    />
  );
}
