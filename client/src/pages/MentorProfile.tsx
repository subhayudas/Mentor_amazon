import * as React from "react";
import { Link, useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { skipToken, useQuery } from "@tanstack/react-query";
import { ArrowLeft, CircleAlert, UserX } from "lucide-react";

import { EmptyState } from "@/components/EmptyState";
import { RequestRail } from "@/components/RequestRail";
import { CalEmbed } from "@/components/CalEmbed";
import { Container } from "@/components/layout/Container";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { BookingRequestDialog, type BookingPrefill } from "@/components/booking/BookingRequestDialog";
import { RequestStatusCard } from "@/components/booking/RequestStatusCard";
import { isSentMemoryStale, railStopsFor, resolveRequestState } from "@/components/booking/requestState";
import { AboutSection } from "@/components/profile/AboutSection";
import { AvailabilityWindows } from "@/components/profile/AvailabilityWindows";
import { HelpsWith } from "@/components/profile/HelpsWith";
import { MobileActionBar } from "@/components/profile/MobileActionBar";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { ProfileSkeleton } from "@/components/profile/ProfileSkeleton";
import { RequestRailCard } from "@/components/profile/RequestRailCard";
import { UnavailableBlock } from "@/components/profile/UnavailableBlock";
import { mentorDisplay } from "@/components/profile/localized";
import { backLinkRowClass, profileGridClass } from "@/components/profile/styles";
import { DESKTOP_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { useAuth } from "@/context/AuthContext";
import { usePublicAvailability, windowsForMentor } from "@/lib/availability";
import type { Booking, Mentee, Mentor, PublicMentor } from "@/lib/database";
import { bidi } from "@/lib/format";
import { discoveryUrl } from "@/lib/routes";
import { clearSentRequest, getSentRequest, markSent } from "@/lib/sentRequests";
import { menteeService, mentorService } from "@/lib/services";
import { lastDiscoveryHref } from "@/lib/urlState";
import { useConfirmOnCalBooking } from "@/pages/mentee/useConfirmOnCalBooking";

/** localStorage mirror used by the anonymous request path (Login/registration read the same keys). */
function readStored(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

/**
 * "Back to mentors" → the last discovery URL, never a bare /mentors (P1-12).
 * One anchor, no nested button (the old page wrapped a Button in a Link):
 * `link-back` names the anchor, `button-back` its label span, so both legacy
 * test ids still resolve to the same control.
 */
function BackLink() {
  const { t } = useTranslation();
  return (
    <Link
      href={lastDiscoveryHref()}
      data-testid="link-back"
      className={`${backLinkRowClass} rounded-sm text-body-sm text-muted-foreground transition-colors duration-fast hover:text-foreground`}
    >
      <ArrowLeft className="size-4 rtl:-scale-x-100" strokeWidth={1.5} aria-hidden="true" />
      <span data-testid="button-back">{t("mentorProfile.backToMentors")}</span>
    </Link>
  );
}

/**
 * Not found / load error share one frame: the page title h1, then a compact
 * EmptyState. Exported so `/mentor/:id/book` shows the same not-found state as
 * `/mentor/:id` for an unknown id (never another mentor's page, F23).
 * `notFound` gives the h1 of every other missing page ("Page not found", the
 * heading the route-change effect focuses and screen readers announce); the
 * card keeps the mentor-specific explanation. A load error keeps the profile
 * title, because the mentor may well exist.
 */
export function ProfileState({
  icon,
  title,
  description,
  testId,
  action,
  notFound = false,
}: {
  icon: typeof UserX;
  title: string;
  description: string;
  testId: string;
  action?: React.ReactNode;
  notFound?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Container className="pb-16">
      {notFound ? (
        <PageHeader eyebrow="404" title={t("errors.notFoundTitle")} />
      ) : (
        <PageHeader title={t("nav.titles.mentor")} />
      )}
      <EmptyState
        icon={icon}
        title={title}
        description={description}
        titleAs="h2"
        data-testid={testId}
        action={action}
        secondaryAction={
          <Button variant={action ? "outline" : "secondary"} className="max-md:h-11 max-md:text-base" asChild>
            <Link href={lastDiscoveryHref()} data-testid="link-back">
              {t("mentorProfile.backToMentors")}
            </Link>
          </Button>
        }
      />
    </Container>
  );
}

/**
 * Public mentor profile `/mentor/:id` (also `/mentors/:id`) — spec §6 as
 * amended (P1-17, P1-18, P1-19, P1-12, P1-21, P1-30) plus the booking request
 * flow of §7. Anonymous visitors can request a session; signed-in mentees get
 * their identity prefilled and, when a booking row is visible, the live status.
 */
export default function MentorProfile() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const params = useParams<{ id?: string }>();
  const mentorId = params.id ?? "";
  const { user } = useAuth();
  const signedIn = Boolean(user);
  const isDesktop = useMediaQuery(DESKTOP_QUERY);

  const mentorQuery = useQuery<PublicMentor | null>({
    queryKey: ["mentor", mentorId],
    queryFn: () => mentorService.getById(mentorId),
    enabled: mentorId.length > 0,
    staleTime: 5 * 60_000,
  });
  const availability = usePublicAvailability();
  const windows = React.useMemo(() => windowsForMentor(availability.data, mentorId), [availability.data, mentorId]);

  // Signed-in identity: the mentees row (name, id) via the same key and
  // queryFn the dashboard uses, so the two never race for different shapes.
  const email = user?.email;
  const menteeQuery = useQuery<Mentee | null>({
    queryKey: ["mentee", "email", email],
    queryFn: () => menteeService.getByEmail(email!),
    enabled: Boolean(email),
    staleTime: 5 * 60_000,
  });
  const menteeId = user?.profile_id ?? menteeQuery.data?.id;
  // The live booking row (P1-21): signed-in viewers fetch their bookings
  // through the same key and queryFn the dashboard uses, so a direct load of
  // the profile shows a scheduled/pending request instead of inviting a
  // duplicate; the two caches merge and the dashboard's polling keeps this
  // observer fresh. Anonymous visitors never fetch (`skipToken`) — RLS would
  // not return a row to them anyway.
  const bookingsQuery = useQuery<(Booking & { mentor?: Mentor })[]>({
    queryKey: ["mentee", menteeId, "bookings"],
    queryFn: signedIn && menteeId ? () => menteeService.getBookings(menteeId) : skipToken,
    staleTime: 60_000,
  });
  const onCalBooked = useConfirmOnCalBooking(menteeId ?? "");
  const [calOpen, setCalOpen] = React.useState(false);

  const [localSent, setLocalSent] = React.useState(() => getSentRequest(mentorId));
  React.useEffect(() => {
    setLocalSent(getSentRequest(mentorId));
  }, [mentorId]);
  // Bookings fetched after the send decide for a signed-in viewer: a declined, withdrawn or
  // removed request no longer reads as "Request sent" here, nor on the directory cards.
  const bookingsAsOf = bookingsQuery.dataUpdatedAt || undefined;
  const staleMemory = isSentMemoryStale({
    mentorId,
    bookings: signedIn ? bookingsQuery.data : undefined,
    bookingsAsOf,
    viewerEmail: user?.email,
    local: localSent,
  });
  React.useEffect(() => {
    if (!staleMemory) return;
    clearSentRequest(mentorId);
    setLocalSent(null);
  }, [staleMemory, mentorId]);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const returnFocusRef = React.useRef<HTMLElement | null>(null);
  const registerReturnFocus = React.useCallback((element: HTMLElement | null) => {
    returnFocusRef.current = element;
  }, []);

  const mentor = mentorQuery.data ?? null;
  const display = React.useMemo(() => (mentor ? mentorDisplay(mentor, lang) : null), [mentor, lang]);

  const openDialog = React.useCallback(() => setDialogOpen(true), []);
  const openCal = React.useCallback(() => setCalOpen(true), []);
  const handleSent = React.useCallback(
    (sentEmail: string) => {
      markSent(mentorId, sentEmail);
      setLocalSent(getSentRequest(mentorId));
    },
    [mentorId],
  );

  if (!mentorId || (mentorQuery.isSuccess && !mentor)) {
    return (
      <ProfileState
        icon={UserX}
        title={t("mentorProfile.notFound.title")}
        description={t("mentorProfile.notFound.body")}
        testId="mentor-not-found"
        notFound
      />
    );
  }
  if (mentorQuery.isError) {
    return (
      <ProfileState
        icon={CircleAlert}
        title={t("mentorProfile.loadError.title")}
        description={t("mentorProfile.loadError.body")}
        testId="mentor-load-error"
        action={
          <Button
            variant="secondary"
            className="max-md:h-11 max-md:text-base"
            onClick={() => void mentorQuery.refetch()}
            data-testid="button-retry-mentor"
          >
            {t("common.tryAgain")}
          </Button>
        }
      />
    );
  }
  if (!mentor || !display) {
    // Reserve the availability block until the rows say this mentor has none (F-31).
    return <ProfileSkeleton reserveAvailability={!availability.isSuccess || windows.length > 0} />;
  }

  const request = resolveRequestState({
    mentorId,
    isAvailable: mentor.is_available,
    bookings: signedIn ? bookingsQuery.data : undefined,
    bookingsAsOf,
    viewerEmail: user?.email,
    local: localSent,
  });
  const similarHref = discoveryUrl({ expertise: mentor.expertise?.[0] ? [mentor.expertise[0]] : [] });
  const prefill: BookingPrefill = signedIn
    ? {
        name: menteeQuery.data?.name ?? user?.name ?? "",
        email: user?.email ?? "",
        nameReadOnly: Boolean(menteeQuery.data?.name),
        emailReadOnly: true,
      }
    : { name: readStored("menteeName"), email: readStored("menteeEmail"), nameReadOnly: false, emailReadOnly: false };
  const invalidateKeys = signedIn && menteeId ? [["mentee", menteeId, "bookings"]] : undefined;

  const slotProps = {
    mentor,
    mentorName: display.name,
    request,
    signedIn,
    similarHref,
    onRequest: openDialog,
    onChooseTime: openCal,
    registerReturnFocus,
  };
  const railStops = railStopsFor(t, request, { signedIn, name: bidi(display.name) }).stops;
  const mobileRail = (
    <section aria-labelledby="profile-rail-title">
      <h2 id="profile-rail-title" className="text-h2-sm text-foreground md:text-h2">
        {request.kind === "sent" ? t("dashboardV2.rail.title") : t("common.rail.title")}
      </h2>
      <RequestRail size="sm" stops={railStops} className="mt-4" />
    </section>
  );
  const calLink = request.kind === "sent" ? request.calLink : undefined;

  return (
    <Container className="pb-24 lg:pb-16 [@media(max-height:520px)]:pb-8">
      <BackLink />
      {/* The accepting badge shows once: in the request card on desktop, here on mobile (F-30). */}
      <ProfileHeader mentor={mentor} display={display} showBadge={!isDesktop} />

      {!isDesktop && (!mentor.is_available || request.kind === "sent") && (
        <div className="mt-5 flex flex-col gap-4">
          {/* Not accepting keeps its block and the "Find similar mentors" escape even once a request was sent. */}
          {!mentor.is_available && (
            <UnavailableBlock
              mentorName={display.name}
              similarHref={similarHref}
              testId="mentor-unavailable"
              showBadge={false}
            />
          )}
          {request.kind === "sent" && (
            <>
              {/* The fixed MobileActionBar carries the one "Choose a time" fill on phones;
                  the block keeps the status, links and focus target only (one orange per viewport). */}
              <RequestStatusCard
                request={request}
                mentorName={display.name}
                signedIn={signedIn}
                firstLinkRef={registerReturnFocus}
              />
              {/* The rail sits with the status it explains, not 600px lower after About (N-03). */}
              {mobileRail}
            </>
          )}
        </div>
      )}

      <div className={profileGridClass}>
        <div className="flex min-w-0 flex-col gap-10">
          <HelpsWith expertise={display.expertise} industries={display.industries} />
          <AboutSection name={display.name} bio={display.bio} />
          {!isDesktop && request.kind !== "sent" && mobileRail}
          {!isDesktop && windows.length > 0 && (
            <AvailabilityWindows windows={windows} mentorTz={mentor.timezone} headingLevel="h2" />
          )}
        </div>
        {isDesktop && (
          <div className="lg:sticky lg:top-20 lg:self-start">
            <RequestRailCard {...slotProps} windows={windows} />
          </div>
        )}
      </div>

      {!isDesktop && <MobileActionBar {...slotProps} />}

      <BookingRequestDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mentor={mentor}
        mentorName={display.name}
        signedIn={signedIn}
        prefill={prefill}
        similarHref={similarHref}
        returnFocusRef={returnFocusRef}
        onSent={handleSent}
        invalidateKeys={invalidateKeys}
      />

      {calLink && request.kind === "sent" && request.bookingId && (
        <CalEmbed
          calLink={calLink}
          mentorName={display.name}
          menteeName={prefill.name}
          menteeEmail={prefill.email}
          bookingId={request.bookingId}
          open={calOpen}
          onOpenChange={setCalOpen}
          onBookingSuccessful={onCalBooked(request.bookingId, display.name)}
        />
      )}
    </Container>
  );
}
