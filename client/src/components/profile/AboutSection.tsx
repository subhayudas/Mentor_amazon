import * as React from "react";
import { Trans, useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cx } from "@/components/profile/styles";

/** Bios longer than this open in a dialog instead of expanding in place. */
const DIALOG_THRESHOLD = 1200;

const toggleClass =
  "mt-2 inline-flex min-h-8 items-center rounded-sm text-body-sm font-medium text-secondary underline decoration-1 underline-offset-4 transition-colors duration-fast hover:decoration-2 coarse:min-h-11";

/** True while the paragraph is visually clamped (scrollHeight beats clientHeight). Re-measured on resize. */
function useIsClamped(ref: React.RefObject<HTMLElement>, active: boolean, text: string): boolean {
  const [clamped, setClamped] = React.useState(false);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    const measure = () => setClamped(el.scrollHeight > el.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, active, text]);
  return clamped;
}

/**
 * "About": the bio at prose measure, clamped to six lines with "Read more"
 * that expands in place (no height animation). Past 1,200 characters the
 * control opens a Dialog titled "About {name}" instead, so the page keeps
 * its shape. Whitespace is preserved (`whitespace-pre-line`) so the mentor's
 * paragraphs survive.
 */
export function AboutSection({ name, bio }: { name: string; bio: string }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const paragraphRef = React.useRef<HTMLParagraphElement>(null);
  const text = bio.trim();
  const useDialog = text.length > DIALOG_THRESHOLD;
  const clamped = useIsClamped(paragraphRef, !expanded, text);

  if (!text) return null;

  const showToggle = useDialog ? clamped : expanded || clamped;

  return (
    <section aria-labelledby="profile-about">
      <h2 id="profile-about" className="text-h2-sm text-foreground md:text-h2">
        {t("mentorProfile.about")}
      </h2>
      <p
        ref={paragraphRef}
        id="profile-about-text"
        data-testid="text-mentor-bio"
        dir="auto"
        className={cx(
          "mt-3 max-w-prose whitespace-pre-line text-body text-foreground text-pretty",
          !expanded && "line-clamp-6",
        )}
      >
        {text}
      </p>
      {showToggle && !useDialog && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls="profile-about-text"
          onClick={() => setExpanded((value) => !value)}
          className={toggleClass}
        >
          {expanded ? t("mentorProfile.readLess") : t("mentorProfile.readMore")}
        </button>
      )}
      {showToggle && useDialog && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <button type="button" onClick={() => setDialogOpen(true)} className={toggleClass}>
            {t("mentorProfile.readMore")}
          </button>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                <Trans i18nKey="mentorProfile.aboutName" values={{ name }} components={{ name: <bdi /> }} />
              </DialogTitle>
              <DialogDescription className="sr-only">{t("mentorProfile.aboutDialogDescription")}</DialogDescription>
            </DialogHeader>
            <div dir="auto" className="max-w-prose whitespace-pre-line text-body text-foreground">
              {text}
            </div>
            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                {t("common.close")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
