import * as React from "react";
import { Link, useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { skipToken, useQuery } from "@tanstack/react-query";
import { ArrowLeft, CircleAlert, UserX } from "lucide-react";

import { EmptyState } from "@/components/EmptyState";
import { DEFAULT_STOPS, RequestRail } from "@/components/RequestRail";
import { Container } from "@/components/layout/Container";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { BookingRequestDialog, type BookingPrefill } from "@/components/booking/BookingRequestDialog";
import { RequestStatusCard } from "@/components/booking/RequestStatusCard";
import { resolveRequestState } from "@/components/booking/requestState";
import { AboutSection } from "@/components/profile/AboutSection";
import { AvailabilityWindows } from "@/components/profile/AvailabilityWindows";
import { HelpsWith } from "@/components/profile/HelpsWith";
import { MobileActionBar } from "@/components/profile/MobileActionBar";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { ProfileSkeleton } from "@/components/profile/ProfileSkeleton";
import { RequestRailCard } from "@/components/profile/RequestRailCard";
import { SessionStyle } from "@/components/profile/SessionStyle";
import { TimeZoneNote } from "@/components/profile/TimeZoneNote";
import { UnavailableBlock } from "@/components/profile/UnavailableBlock";
import { mentorDisplay } from "@/components/profile/localized";
import { DESKTOP_QUERY, useMediaQuery } from "@/components/profile/useMediaQuery";
import { useAuth } from "@/context/AuthContext";
import { usePublicAvailability, windowsForMentor } from "@/lib/availability";
import type { Booking, Mentee, PublicMentor } from "@/lib/database";
import { discoveryUrl } from "@/lib/routes";
import { getSentRequest, markSent } from "@/lib/sentRequests";
import { menteeService, mentorService } from "@/lib/services";
import { lastDiscoveryHref } from "@/lib/urlState";

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
      className="mt-6 inline-flex min-h-8 items-center gap-1 rounded-sm text-body-sm text-muted-foreground transition-colors duration-fast hover:text-foreground"
    >
      <ArrowLeft className="size-4 rtl:-scale-x-100" strokeWidth={1.5} aria-hidden="true" />
      <span data-testid="button-back">{t("mentorProfile.backToMentors")}</span>
    </Link>
  );
}

/** Not found / load error share one frame: the page title h1, then a compact EmptyState. */
function ProfileState({
  icon,
  title,
  description,
  testId,
  action,
}: {
  icon: typeof UserX;
  title: string;
  description: string;
  testId: string;
  action?: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Container className="pb-16">
      <PageHeader title={t("nav.titles.mentor")} />
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
  const bookingsQuery = useQuery<Booking[]>({
    queryKey: ["mentee", menteeId, "bookings"],
    queryFn: signedIn && menteeId ? () => menteeService.getBookings(menteeId) : skipToken,
    staleTime: 60_000,
  });

  const [localSent, setLocalSent] = React.useState(() => getSentRequest(mentorId));
  React.useEffect(() => {
    setLocalSent(getSentRequest(mentorId));
  }, [mentorId]);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const returnFocusRef = React.useRef<HTMLElement | null>(null);
  const registerReturnFocus = React.useCallback((element: HTMLElement | null) => {
    returnFocusRef.current = element;
  }, []);

  const mentor = mentorQuery.data ?? null;
  const display = React.useMemo(() => (mentor ? mentorDisplay(mentor, lang) : null), [mentor, lang]);

  const openDialog = React.useCallback(() => setDialogOpen(true), []);
  const sendAnother = React.useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    returnFocusRef.current = event.currentTarget;
    setDialogOpen(true);
  }, []);
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
    return <ProfileSkeleton />;
  }

  const request = resolveRequestState({
    mentorId,
    isAvailable: mentor.is_available,
    bookings: signedIn ? bookingsQuery.data : undefined,
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
    onSendAnother: sendAnother,
    registerReturnFocus,
  };

  return (
    <Container className="pb-24 lg:pb-16 [@media(max-height:520px)]:pb-8">
      <BackLink />
      <div className="mt-8">
        <ProfileHeader mentor={mentor} display={display} />
      </div>

      {!isDesktop && (
        <div className="mt-5 flex flex-col gap-4">
          {/* Not accepting keeps its block and the "Find similar mentors" escape even once a request was sent. */}
          {!mentor.is_available ? (
            <UnavailableBlock
              mentorName={display.name}
              similarHref={similarHref}
              testId="mentor-unavailable"
              showBadge={false}
            />
          ) : (
            <TimeZoneNote mentorName={display.name} mentorTz={mentor.timezone} />
          )}
          {request.kind === "sent" && (
            <RequestStatusCard
              request={request}
              mentorName={display.name}
              signedIn={signedIn}
              canSendAnother={mentor.is_available}
              onSendAnother={sendAnother}
              firstLinkRef={registerReturnFocus}
            />
          )}
        </div>
      )}

      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_336px] lg:gap-12">
        <div className="flex min-w-0 flex-col gap-10">
          <HelpsWith expertise={display.expertise} industries={display.industries} />
          <AboutSection name={display.name} bio={display.bio} />
          <SessionStyle preference={mentor.mentorship_preference} />
          {!isDesktop && (
            <section aria-labelledby="profile-rail-title">
              <h2 id="profile-rail-title" className="text-h2-sm text-foreground md:text-h2">
                {t("common.rail.title")}
              </h2>
              <RequestRail size="sm" stops={DEFAULT_STOPS(t)} className="mt-4" />
            </section>
          )}
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

      {!isDesktop && <MobileActionBar {...slotProps} isAvailable={mentor.is_available} />}

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
    </Container>
  );
}
