import * as React from "react";
import { Trans, useTranslation } from "react-i18next";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";

/**
 * "Discard request?" guard (P0-3, P2-13): opens only when the goal field is
 * dirty and the user tries to leave the booking dialog (Escape, outside
 * click, close button, Cancel). Radix focuses Cancel ("Keep editing") by
 * default, so the safe choice is one keypress away; "Discard request" names
 * its consequence. On "Keep editing" focus goes back to `returnFocusRef`
 * (the goal field) explicitly: stacked on top of a modal Dialog, the alert's
 * default restore lands on `body`.
 */
export function DiscardRequestDialog({
  open,
  onOpenChange,
  mentorName,
  onDiscard,
  returnFocusRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mentorName: string;
  onDiscard: () => void;
  /** Focused again after "Keep editing"; ignored once the field has unmounted (discard). */
  returnFocusRef?: React.RefObject<HTMLElement>;
}) {
  const { t } = useTranslation();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        data-testid="dialog-discard-request"
        className="max-w-md"
        onCloseAutoFocus={(event) => {
          const target = returnFocusRef?.current;
          if (target && target.isConnected) {
            event.preventDefault();
            target.focus();
          }
        }}
      >
        <AlertDialogHeader>
          {/* Inner spans restate the type roles until lib/utils.ts merges them (see BookingRequestDialog). */}
          <AlertDialogTitle>
            <span className="text-h3">{t("bookingRequest.discard.title")}</span>
          </AlertDialogTitle>
          <AlertDialogDescription>
            <span className="text-body-sm">
              <Trans i18nKey="bookingRequest.discard.body" values={{ name: mentorName }} components={{ name: <bdi /> }} />
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-keep-editing">{t("bookingRequest.discard.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            data-testid="button-discard-request"
            className={buttonVariants({ variant: "destructive" })}
            onClick={onDiscard}
          >
            {t("bookingRequest.discard.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
