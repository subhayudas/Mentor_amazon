import * as React from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, History, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { featuredMentorByAnyId } from "@/data/featuredMentors";
import { IS_LOCAL } from "@/lib/demo";
import { formatDate } from "@/lib/format";
import { clearLegacyLocalData, detectLegacyLocalData, type LegacyItem, type StorageLike } from "@/lib/legacyLocalData";
import { cn } from "@/lib/utils";

function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * One-time notice for data this browser kept during the preview period (design
 * C2, F19; open risk R15). Database mode only: in local mode the same keys ARE
 * the app's data. It reads the keys once, never uses them, and offers to show
 * what they were and to clear them; once cleared it does not come back.
 */
export function LegacyLocalDataNotice() {
  if (IS_LOCAL) return null;
  return <LegacyLocalDataNoticeInner />;
}

function LegacyLocalDataNoticeInner() {
  const { t, i18n } = useTranslation();
  const [data, setData] = React.useState(() => detectLegacyLocalData(browserStorage()));
  const [open, setOpen] = React.useState(false);
  const listId = React.useId();

  if (data.total === 0) return null;

  const clear = () => {
    const storage = browserStorage();
    clearLegacyLocalData(storage);
    setData(detectLegacyLocalData(storage));
  };

  const mentorLabel = (id: string, name?: string) => {
    if (name) return name;
    const featured = featuredMentorByAnyId(id);
    if (featured) return i18n.language === "ar" && featured.name_ar ? featured.name_ar : featured.name;
    return t("legacyData.unknownMentor");
  };

  const describe = (item: LegacyItem): string => {
    switch (item.kind) {
      case "request":
        return item.goal
          ? t("legacyData.item.request", { mentor: mentorLabel(item.mentorId, item.mentorName), goal: item.goal })
          : t("legacyData.item.requestNoGoal", { mentor: mentorLabel(item.mentorId, item.mentorName) });
      case "registration":
        return t("legacyData.item.registration", { name: item.organization || item.name || item.email || "—" });
      case "mentorProfile":
        return t("legacyData.item.mentorProfile", { name: item.name || item.email || "—" });
      case "favorite":
        return t("legacyData.item.favorite", { mentor: mentorLabel(item.mentorId, item.mentorName) });
    }
  };

  return (
    <section aria-labelledby={`${listId}-title`} className="border-b border-warning-border bg-warning text-warning-foreground" data-testid="notice-legacy-data">
      <div className="container-page py-3">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
          <History className="mt-0.5 size-4 shrink-0 text-warning-icon" aria-hidden="true" />
          <div className="min-w-0 flex-1" role="status">
            <p id={`${listId}-title`} className="text-body-sm font-semibold">
              {t("legacyData.title")}
            </p>
            <p className="text-body-sm text-pretty" data-testid="text-legacy-count" data-count={data.total}>
              {t("legacyData.body", { count: data.total })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-11 md:h-9"
              aria-expanded={open}
              aria-controls={listId}
              onClick={() => setOpen((v) => !v)}
              data-testid="button-legacy-show"
            >
              <ChevronDown className={cn("transition-transform duration-fast", open && "rotate-180")} aria-hidden="true" />
              {t(open ? "legacyData.hide" : "legacyData.show")}
            </Button>
            <Button type="button" variant="secondary" size="sm" className="h-11 md:h-9" onClick={clear} data-testid="button-legacy-clear">
              <Trash2 aria-hidden="true" />
              {t("legacyData.clear")}
            </Button>
          </div>
        </div>
        <ul id={listId} hidden={!open} className="mt-3 space-y-1.5 border-t border-warning-border pt-3 text-body-sm" data-testid="list-legacy-items">
          {data.items.map((item) => (
            <li key={`${item.kind}-${item.id}`} className="flex flex-wrap gap-x-2">
              <span className="min-w-0" dir="auto">
                {describe(item)}
              </span>
              {item.createdAt && <span className="text-caption opacity-80">· {formatDate(item.createdAt, i18n.language)}</span>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
