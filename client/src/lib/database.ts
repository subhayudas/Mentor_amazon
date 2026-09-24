/**
 * Frontend Database Service
 * Handles all database operations directly from the client using Supabase
 */

import { supabase } from './supabase';
import { isRecordable, toEmbedRecordOutcome, type CalBookingSuccess, type EmbedRecordOutcome } from './calEvents';
import { mapRpcError } from './requests';

// Type definitions based on the database schema

/**
 * Full mentors row. Contact and scheduling fields are optional because RLS only
 * returns them to the owning mentor and admins; public reads come back as
 * `PublicMentor` (the `mentors_public` view), which is assignable to `Mentor`.
 */
export interface Mentor {
  id: string;
  name: string;
  name_ar?: string;
  /** Owner/admin only. */
  email?: string;
  company?: string;
  company_ar?: string;
  position?: string;
  position_ar?: string;
  timezone: string;
  country?: string;
  photo_url?: string;
  bio: string;
  bio_ar?: string;
  /** Owner/admin only. */
  linkedin_url?: string;
  /** Owner/admin only; mentees receive it per booking via `mentor_scheduling_links`. */
  cal_link?: string;
  cal_15min?: string;
  cal_30min?: string;
  cal_60min?: string;
  expertise: string[];
  expertise_ar?: string[];
  industries: string[];
  industries_ar?: string[];
  languages_spoken: string[];
  /** Owner/admin only. */
  comms_owner?: 'exec' | 'assistant';
  /** Owner/admin only. */
  assistant_email?: string;
  mentorship_preference?: 'ongoing' | 'rotating' | 'either';
  /** Owner/admin only. */
  why_joined?: string;
  is_available: boolean;
  average_rating?: string;
  total_ratings?: number;
  /** Curated mentor whose requests the programme admins answer (no owner account). */
  managed_by_programme?: boolean;
  created_at: string;
  updated_at?: string;
}

/** Columns of the `mentors_public` view: everything a visitor may see about a mentor. */
export type PublicMentor = Pick<
  Mentor,
  | 'id' | 'name' | 'name_ar' | 'company' | 'company_ar' | 'position' | 'position_ar'
  | 'timezone' | 'country' | 'photo_url' | 'bio' | 'bio_ar' | 'expertise' | 'expertise_ar'
  | 'industries' | 'industries_ar' | 'languages_spoken' | 'mentorship_preference'
  | 'is_available' | 'average_rating' | 'total_ratings' | 'created_at'
>;

/** Row of the `mentor_scheduling_links` view (only the caller's schedulable bookings). */
export interface MentorSchedulingLinks {
  booking_id: string;
  mentor_id: string;
  cal_link?: string;
  cal_15min?: string;
  cal_30min?: string;
  cal_60min?: string;
}

/** Events accepted by the `notify_booking_event` RPC, which derives recipient and text. */
export type BookingEvent =
  | 'booking_request'
  | 'booking_accepted'
  | 'booking_rejected'
  | 'booking_confirmed'
  | 'booking_completed'
  | 'booking_canceled'
  | 'feedback_received_by_mentor'
  | 'feedback_received_by_mentee';

export interface CompleteBookingOptions {
  /** Actual session length in minutes (1..600); feeds volunteer hours. */
  sessionDurationMinutes: number;
  /** Reporting country; the database falls back to the mentor's country when omitted. */
  country?: string;
}

/** `users` row without secrets, as returned to admins. */
export type UserSummary = Pick<User, 'id' | 'email' | 'user_type' | 'profile_id' | 'amazon_alias' | 'is_verified' | 'created_at'>;

export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

export interface Mentee {
  id: string;
  name: string;
  email: string;
  user_type: 'individual' | 'organization';
  organization_name?: string;
  organization_website?: string;
  organization_sector?: string;
  organization_size?: string;
  organization_mission?: string;
  organization_needs?: string;
  /** NGO verification state. Organizations start 'pending'; individuals stay 'unverified'. */
  verification_status?: VerificationStatus;
  /** Registration / licence number or third-party check reference supplied at registration. */
  verification_reference?: string;
  country?: string;
  timezone: string;
  photo_url?: string;
  bio?: string;
  linkedin_url?: string;
  languages_spoken: string[];
  areas_exploring: string[];
  goals?: string;
  created_at: string;
}

export interface Booking {
  id: string;
  mentor_id: string;
  mentee_id: string;
  cal_event_uri?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'confirmed' | 'completed' | 'canceled';
  goal?: string;
  scheduled_at?: string;
  clicked_at?: string;
  responded_at?: string;
  completed_at?: string;
  canceled_at?: string;
  mentee_rating?: number;
  mentee_feedback?: string;
  mentor_rating?: number;
  mentor_feedback?: string;
  /** Actual session length, captured when the session is marked completed. Feeds volunteer hours. */
  session_duration_minutes?: number;
  /** Country the session is attributed to for reporting (defaults to the mentor's country). */
  country?: string;
  /** State of the linked Cal.com booking, written only by the scheduler RPCs and the webhook. */
  cal_status?: 'requested' | 'accepted' | 'rejected' | 'cancelled' | null;
  /** Start time of a Cal.com booking awaiting the mentor's confirmation (UTC). */
  cal_requested_start?: string | null;
  /** Who cancelled the session. */
  canceled_by?: 'mentor' | 'mentee' | 'admin' | 'cal' | null;
  created_at: string;
}

export interface BookingNote {
  id: string;
  booking_id: string;
  author_type: 'mentor' | 'mentee';
  author_email: string;
  note_type: 'note' | 'task';
  content: string;
  is_completed?: boolean;
  due_date?: string;
  created_at: string;
}

export interface Notification {
  id: string;
  recipient_email: string;
  recipient_type: 'mentor' | 'mentee';
  type: 'booking_request' | 'booking_accepted' | 'booking_rejected' | 'booking_completed' | 'booking_canceled' | 'booking_confirmed' | 'feedback_received' | 'reminder';
  title: string;
  message: string;
  booking_id?: string;
  is_read: boolean;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  password: string;
  user_type: 'mentor' | 'mentee' | 'admin';
  profile_id?: string;
  /** Amazon Federate alias (OIDC subject). Unique; the identity key for SSO users. */
  amazon_alias?: string;
  is_verified: boolean;
  reset_token?: string;
  reset_token_expires?: string;
  created_at: string;
}

export interface ApprovedUser {
  id: string;
  amazon_alias: string;
  email?: string;
  role: 'mentor' | 'admin';
  mentor_id?: string;
  is_active: boolean;
  approved_by?: string;
  approved_at: string;
  note?: string;
}

export interface AccessRequest {
  id: string;
  amazon_alias: string;
  email?: string;
  name?: string;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
  resolved_at?: string;
  resolved_by?: string;
  note?: string;
}

export interface MentorAvailability {
  id: string;
  mentor_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
  created_at: string;
}

export interface MentorTask {
  id: string;
  mentor_id: string;
  mentee_id?: string;
  booking_id?: string;
  title: string;
  description?: string;
  due_date?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'canceled';
  priority: 'low' | 'medium' | 'high';
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface MentorEarnings {
  id: string;
  mentor_id: string;
  booking_id?: string;
  amount: string;
  currency: string;
  earned_at: string;
  payout_month: string;
  payout_status: 'pending' | 'paid';
}

export interface MentorActivityLog {
  id: string;
  mentor_id: string;
  mentee_id?: string;
  booking_id?: string;
  activity_type: 'booking_received' | 'booking_confirmed' | 'booking_completed' | 'booking_canceled' | 'task_created' | 'task_completed' | 'rating_received';
  title: string;
  description?: string;
  created_at: string;
}

/** A mentee's saved mentor (`mentee_favorites`). */
export interface Favorite {
  id: string;
  mentee_id: string;
  mentor_id: string;
  created_at: string;
}

export type ActivityType =
  | 'mentor_registered'
  | 'mentee_registered'
  | 'profile_updated'
  | 'calendar_updated'
  | 'request_sent'
  | 'request_accepted'
  | 'request_declined'
  | 'booking_confirmed'
  | 'booking_rescheduled'
  | 'booking_canceled'
  | 'session_completed'
  | 'feedback_left'
  | 'favorite_added'
  | 'favorite_removed'
  | 'reminder_sent'
  | 'mentor_listed'
  | 'mentor_unlisted'
  | 'mentee_verified'
  | 'mentee_rejected'
  | 'booking_time_requested'
  | 'booking_time_declined';

/**
 * Append-only audit event (`activity_events`). Written by the app at every
 * state change and by the Cal.com webhook / reminder cron server-side; never
 * updated or deleted. `summary` is the human line shown in the feed.
 */
export interface ActivityEvent {
  id: string;
  actor_type: 'mentor' | 'mentee' | 'admin' | 'system';
  actor_id?: string;
  actor_name?: string;
  type: ActivityType;
  subject_type?: 'booking' | 'mentor' | 'mentee' | 'favorite' | 'settings';
  subject_id?: string;
  /** Every party who should see the event (mentor id, mentee id); admins see all. */
  visible_to: string[];
  summary: string;
  meta?: Record<string, unknown>;
  created_at: string;
}

export interface MentorDashboardStats {
  totalSessions: number;
  completedSessions: number;
  averageRating: number;
  /** Sum of session_duration_minutes across completed sessions (volunteer hours = /60). */
  volunteerMinutes: number;
  /** Volunteer minutes in the current calendar month. */
  monthlyVolunteerMinutes: number;
  pendingBookings: number;
  feedbackCount: number;
}

// Helper to generate UUIDs
function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Whether a Supabase session is present (local check, no network). Anonymous
 * visitors have no grant on `mentors`, so PostgREST embeds of it must be
 * skipped for them.
 */
async function hasSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return !!data.session;
}

const SCHEDULABLE_STATUSES = new Set<Booking['status']>(['accepted', 'confirmed', 'completed']);

/**
 * Case-insensitive exact match for an email column. RLS compares emails with
 * lower(), Supabase Auth lowercases sign-in emails, but profile rows keep the
 * case typed at registration, so lookups must ignore case too. LIKE wildcards
 * in the value are escaped so this stays an exact match.
 */
function escapeLikePattern(value: string): string {
  return value.trim().replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

// Database Service Class
class DatabaseService {
  // ==================== MENTORS ====================
  
  /**
   * Public directory read: the WHOLE `mentors_public` view (no contact data),
   * fetched once under queryKey ['mentors'] and filtered client-side by
   * `lib/discovery.ts` (spec §0, P1-2).
   *
   * `filters` is accepted for signature compatibility with older callers but
   * deliberately ignored: the previous `.or(name.ilike…)` branch interpolated
   * user input unescaped into a PostgREST filter and only searched the English
   * columns, and the `.contains` branches could not localize. Search now runs
   * over EN and AR fields in the browser and never reaches PostgREST.
   */
  async getMentors(_filters?: { search?: string; expertise?: string; industry?: string; language?: string }): Promise<PublicMentor[]> {
    const { data, error } = await supabase.from('mentors_public').select('*');
    if (error) throw error;
    return data || [];
  }

  /** Public profile read (directory + /mentor/:id). Use `getMentorByEmail`/`getOwnMentor` for full rows. */
  async getMentor(id: string): Promise<PublicMentor | null> {
    const { data, error } = await supabase
      .from('mentors_public')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  /** Full row; RLS only returns it to the owning mentor (session email) or an admin. */
  async getMentorByEmail(email: string): Promise<Mentor | null> {
    const { data, error } = await supabase
      .from('mentors')
      .select('*')
      .ilike('email', escapeLikePattern(email))
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  /**
   * Full row for the signed-in mentor, or null when there is no session / no
   * profile yet. Matches by session email, or by the users.profile_id link an
   * admin created (the mentors row may carry a different address than the
   * Amazon identity). RLS enforces both predicates server-side.
   */
  async getOwnMentor(identity?: { email: string; profileId?: string }): Promise<Mentor | null> {
    let email = identity?.email;
    let profileId = identity?.profileId;
    if (!email) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return null;
      email = user.email;
      profileId = profileId ?? (user.user_metadata?.profile_id as string | undefined);
    }
    const byEmail = await this.getMentorByEmail(email);
    if (byEmail || !profileId) return byEmail;

    const { data, error } = await supabase
      .from('mentors')
      .select('*')
      .eq('id', profileId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async createMentor(mentor: Omit<Mentor, 'id' | 'created_at' | 'updated_at' | 'average_rating' | 'total_ratings'>): Promise<Mentor> {
    const id = generateId();
    const now = new Date().toISOString();
    
    const { data, error } = await supabase
      .from('mentors')
      .insert({
        ...mentor,
        id,
        created_at: now,
        updated_at: now,
        average_rating: '0',
        total_ratings: 0,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateMentor(id: string, updates: Partial<Mentor>): Promise<Mentor | null> {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('mentors')
      .update({ ...updates, updated_at: now })
      .eq('id', id)
      .select()
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async updateMentorAvailability(id: string, isAvailable: boolean): Promise<Mentor | null> {
    return this.updateMentor(id, { is_available: isAvailable });
  }

  /**
   * Recomputes average_rating/total_ratings from all of the mentor's bookings.
   * A database trigger already does this whenever a rating changes; this is a
   * best-effort explicit call (a mentee cannot update the mentors table).
   */
  async updateMentorRating(mentorId: string): Promise<void> {
    const { error } = await supabase.rpc('recompute_mentor_rating', { p_mentor_id: mentorId });
    if (error) console.warn('Mentor rating recompute deferred to the database trigger');
  }

  // ==================== ADMIN ====================
  // Plain reads/writes; RLS (`public.is_admin()`) is what authorizes them.

  async getUsers(): Promise<UserSummary[]> {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, user_type, profile_id, amazon_alias, is_verified, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async getApprovedUsers(): Promise<ApprovedUser[]> {
    const { data, error } = await supabase
      .from('approved_users')
      .select('*')
      .order('approved_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async getAccessRequests(status?: AccessRequest['status']): Promise<AccessRequest[]> {
    let query = supabase.from('access_requests').select('*');
    if (status) query = query.eq('status', status);
    const { data, error } = await query.order('requested_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  /** Insert or update the allow-list row for an alias (unique on amazon_alias, stored lowercase). */
  async upsertApprovedUser(row: Omit<ApprovedUser, 'id' | 'approved_at'> & { id?: string; approved_at?: string }): Promise<ApprovedUser> {
    const payload = {
      ...row,
      id: row.id || generateId(),
      amazon_alias: row.amazon_alias.trim().toLowerCase(),
      email: row.email?.trim().toLowerCase() || null,
      approved_at: row.approved_at || new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('approved_users')
      .upsert(payload, { onConflict: 'amazon_alias' })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async updateAccessRequest(id: string, updates: Partial<AccessRequest>): Promise<AccessRequest | null> {
    const { data, error } = await supabase
      .from('access_requests')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  /**
   * Admin-only (enforced by a database trigger). `note` is accepted for API
   * stability but not persisted: mentees has no admin-note column yet.
   */
  async setMenteeVerification(menteeId: string, status: VerificationStatus, _note?: string): Promise<Mentee | null> {
    return this.updateMentee(menteeId, { verification_status: status });
  }

  /** Hides the mentor from the directory and blocks new booking requests. */
  async deactivateMentor(id: string): Promise<Mentor | null> {
    return this.updateMentor(id, { is_available: false });
  }

  async getAllBookingsForAdmin(): Promise<Booking[]> {
    return this.getBookings();
  }

  // ==================== MENTEES ====================

  async getMentees(): Promise<Mentee[]> {
    const { data, error } = await supabase.from('mentees').select('*');
    if (error) throw error;
    return data || [];
  }

  async getMentee(id: string): Promise<Mentee | null> {
    const { data, error } = await supabase
      .from('mentees')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async getMenteeByEmail(email: string): Promise<Mentee | null> {
    const { data, error } = await supabase
      .from('mentees')
      .select('*')
      .ilike('email', escapeLikePattern(email))
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async createMentee(mentee: Omit<Mentee, 'id' | 'created_at'>): Promise<Mentee> {
    const row: Mentee = {
      ...mentee,
      // Organisations queue for review; individuals are never verified.
      verification_status: mentee.verification_status ?? (mentee.user_type === 'organization' ? 'pending' : 'unverified'),
      id: generateId(),
      created_at: new Date().toISOString(),
    };

    // No RETURNING: an anonymous requester has no SELECT policy on mentees, so
    // `.select()` would fail after a successful insert. The row we sent is complete.
    const { error } = await supabase.from('mentees').insert(row);
    if (error) throw error;
    return row;
  }

  async updateMentee(id: string, updates: Partial<Mentee>): Promise<Mentee | null> {
    const { data, error } = await supabase
      .from('mentees')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async getMenteeStats(menteeId: string): Promise<{ totalSessions: number; completedSessions: number; upcomingSessions: number; uniqueMentors: number }> {
    const { data: bookings } = await supabase
      .from('bookings')
      .select('*')
      .eq('mentee_id', menteeId);

    if (!bookings) {
      return { totalSessions: 0, completedSessions: 0, upcomingSessions: 0, uniqueMentors: 0 };
    }

    const totalSessions = bookings.length;
    const completedSessions = bookings.filter(b => b.status === 'completed').length;
    const upcomingSessions = bookings.filter(b => b.status === 'confirmed').length;
    const uniqueMentors = new Set(bookings.map(b => b.mentor_id)).size;

    return { totalSessions, completedSessions, upcomingSessions, uniqueMentors };
  }

  // ==================== BOOKINGS ====================

  async getBookings(): Promise<Booking[]> {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  }

  async getBooking(id: string): Promise<Booking | null> {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  /**
   * A signed-in user's request (design §3.2 `create_my_booking_request`). The
   * RPC always uses the caller's JWT email, never a typed one, validates the
   * goal (20..1000) and name, applies the rate limits, dedupes a pending
   * request from the last 7 days (`already_pending`, nothing written) and
   * notifies the mentor, or every admin for a programme-managed mentor.
   * Anonymous visitors go through `POST /api/requests` instead (`lib/requests.ts`).
   * Throws a `BookingRequestError`.
   */
  async createMyBookingRequest(mentorId: string, goal: string, name?: string): Promise<{ outcome: 'created' | 'already_pending' }> {
    const { data, error } = await supabase.rpc('create_my_booking_request', {
      p_mentor_id: mentorId,
      p_goal: goal.trim(),
      p_name: name?.trim() || null,
    });
    if (error) throw mapRpcError(error);
    const row = (Array.isArray(data) ? data[0] : data) as { outcome?: unknown } | null;
    return { outcome: row?.outcome === 'already_pending' ? 'already_pending' : 'created' };
  }

  /**
   * The mentee booked (or rescheduled) through the Cal.com embed: record it
   * with `record_cal_booking_from_embed` (design §3.2), which locks the row,
   * respects requires-confirmation (`PENDING` → `cal_status` requested) and
   * writes nothing a webhook delivery already wrote (`already_recorded`).
   * Times are UTC ISO strings (F45). Throws when Cal.com gave no uid/start.
   */
  async recordCalBookingFromEmbed(bookingId: string, detail: CalBookingSuccess): Promise<EmbedRecordOutcome | null> {
    if (!isRecordable(detail)) throw new Error('cal_detail_incomplete');
    const { data, error } = await supabase.rpc('record_cal_booking_from_embed', {
      p_booking_id: bookingId,
      p_uid: detail.uid,
      p_start: detail.startTime,
      p_status: detail.status ?? 'ACCEPTED',
      p_reschedule_uid: detail.rescheduleUid ?? null,
    });
    if (error) throw error;
    return toEmbedRecordOutcome(data);
  }

  async getMentorBookings(mentorId: string): Promise<Booking[]> {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('mentor_id', mentorId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  }

  /**
   * The mentor's bookings with the mentee embedded (name, organisation,
   * verification) so the portal never shows a raw mentee id. The same
   * `mentees_select` policy that serves pending rows lets the booked mentor
   * read these rows.
   */
  async getMentorBookingsWithStatus(mentorId: string, status?: string): Promise<(Booking & { mentee?: Mentee })[]> {
    let query = supabase
      .from('bookings')
      .select('*, mentee:mentees(*)')
      .eq('mentor_id', mentorId);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as unknown as (Booking & { mentee?: Mentee })[];
  }

  /**
   * Attaches `mentor` to each of a mentee's bookings. The `mentors` embed only
   * resolves for owners/admins under RLS, so the public profile comes from
   * `mentors_public` and, for accepted/confirmed/completed bookings, the Cal.com
   * links from `mentor_scheduling_links` (filtered server-side to the caller).
   */
  private async attachMentorsForMentee<T extends Booking & { mentor?: Mentor | null }>(rows: T[]): Promise<(Omit<T, 'mentor'> & { mentor?: Mentor })[]> {
    if (rows.length === 0) return [];
    const signedIn = await hasSession();
    const mentorIds = Array.from(new Set(rows.map((r) => r.mentor_id)));
    const schedulableIds = rows.filter((r) => SCHEDULABLE_STATUSES.has(r.status)).map((r) => r.id);

    const [publicRes, linksRes] = await Promise.all([
      supabase.from('mentors_public').select('*').in('id', mentorIds),
      signedIn && schedulableIds.length > 0
        ? supabase.from('mentor_scheduling_links').select('*').in('booking_id', schedulableIds)
        : Promise.resolve({ data: [] as MentorSchedulingLinks[], error: null }),
    ]);
    if (publicRes.error) throw publicRes.error;
    if (linksRes.error) throw linksRes.error;

    const publicById = new Map<string, PublicMentor>((publicRes.data || []).map((m: PublicMentor) => [m.id, m]));
    const linksByBooking = new Map<string, MentorSchedulingLinks>((linksRes.data || []).map((l: MentorSchedulingLinks) => [l.booking_id, l]));

    return rows.map((row) => {
      const { mentor: embedded, ...rest } = row;
      const pub = publicById.get(row.mentor_id);
      if (!embedded && !pub) return rest;
      const links = linksByBooking.get(row.id);
      const mentor: Mentor = {
        ...(pub as Mentor),
        ...(embedded || {}),
        ...(links ? { cal_link: links.cal_link, cal_15min: links.cal_15min, cal_30min: links.cal_30min, cal_60min: links.cal_60min } : {}),
      };
      return { ...rest, mentor };
    });
  }

  async getMenteeBookings(menteeId: string, status?: string): Promise<(Booking & { mentor?: Mentor })[]> {
    const embed = (await hasSession()) ? '*, mentor:mentors(*)' : '*';
    let query = supabase
      .from('bookings')
      .select(embed)
      .eq('mentee_id', menteeId);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    // supabase-js cannot type a select string chosen at runtime
    return this.attachMentorsForMentee((data || []) as unknown as (Booking & { mentor?: Mentor | null })[]);
  }

  async getPendingBookingsForMentor(mentorId: string): Promise<(Booking & { mentee?: Mentee })[]> {
    const { data, error } = await supabase
      .from('bookings')
      .select('*, mentee:mentees(*)')
      .eq('mentor_id', mentorId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /** Marks a session completed with its real duration (mentor or admin only, enforced by a trigger). */
  async completeBooking(bookingId: string, options: CompleteBookingOptions): Promise<Booking | null> {
    const minutes = Math.round(Number(options.sessionDurationMinutes));
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 600) {
      throw new RangeError('Session duration must be between 1 and 600 minutes');
    }
    const update: Partial<Booking> = {
      status: 'completed',
      completed_at: new Date().toISOString(),
      session_duration_minutes: minutes,
    };
    const country = options.country?.trim();
    if (country) update.country = country;

    const { data, error } = await supabase
      .from('bookings')
      .update(update)
      .eq('id', bookingId)
      .select()
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async updateBookingStatus(bookingId: string, status: string): Promise<Booking | null> {
    const now = new Date().toISOString();
    const updateData: Partial<Booking> = { status: status as Booking['status'] };

    if (status === 'completed') {
      updateData.completed_at = now;
    } else if (status === 'canceled') {
      updateData.canceled_at = now;
    }

    const { data, error } = await supabase
      .from('bookings')
      .update(updateData)
      .eq('id', bookingId)
      .select()
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async acceptBooking(bookingId: string): Promise<Booking | null> {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('bookings')
      .update({
        status: 'accepted',
        responded_at: now,
      })
      .eq('id', bookingId)
      .select()
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async declineBooking(bookingId: string): Promise<Booking | null> {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('bookings')
      .update({
        status: 'rejected',
        responded_at: now,
      })
      .eq('id', bookingId)
      .select()
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async submitMenteeFeedback(bookingId: string, rating: number, feedback: string): Promise<Booking | null> {
    const { data, error } = await supabase
      .from('bookings')
      .update({ mentee_rating: rating, mentee_feedback: feedback })
      .eq('id', bookingId)
      .select()
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async submitMentorFeedback(bookingId: string, rating: number, feedback: string): Promise<Booking | null> {
    const { data, error } = await supabase
      .from('bookings')
      .update({ mentor_rating: rating, mentor_feedback: feedback })
      .eq('id', bookingId)
      .select()
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async getMentorFeedback(mentorId: string): Promise<(Booking & { mentee?: Mentee })[]> {
    const { data, error } = await supabase
      .from('bookings')
      .select('*, mentee:mentees(*)')
      .eq('mentor_id', mentorId)
      .not('mentee_rating', 'is', null)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async getMenteeFeedback(menteeId: string): Promise<(Booking & { mentor?: Mentor })[]> {
    const embed = (await hasSession()) ? '*, mentor:mentors(*)' : '*';
    const { data, error } = await supabase
      .from('bookings')
      .select(embed)
      .eq('mentee_id', menteeId)
      .not('mentor_rating', 'is', null)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return this.attachMentorsForMentee((data || []) as unknown as (Booking & { mentor?: Mentor | null })[]);
  }

  // ==================== BOOKING NOTES ====================

  async getBookingNotes(bookingId: string): Promise<BookingNote[]> {
    const { data, error } = await supabase
      .from('booking_notes')
      .select('*')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async createBookingNote(note: Omit<BookingNote, 'id' | 'created_at'>): Promise<BookingNote> {
    const id = generateId();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('booking_notes')
      .insert({
        ...note,
        id,
        created_at: now,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateBookingNote(id: string, updates: Partial<BookingNote>): Promise<BookingNote | null> {
    const { data, error } = await supabase
      .from('booking_notes')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async deleteBookingNote(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('booking_notes')
      .delete()
      .eq('id', id);

    return !error;
  }

  // ==================== NOTIFICATIONS ====================

  // Recipients are stored lowercase by notify_booking_event(); session emails are lowercase too.
  async getNotifications(email: string): Promise<Notification[]> {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_email', email.toLowerCase())
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async getUnreadNotificationCount(email: string): Promise<number> {
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_email', email.toLowerCase())
      .eq('is_read', false);

    if (error) throw error;
    return count || 0;
  }

  /**
   * The only way notifications are created. The SECURITY DEFINER RPC loads the
   * booking, checks the caller is a party (anonymous callers may only announce a
   * request they created in the last 10 minutes), verifies the event matches the
   * booking's state and writes the recipient/title/message itself. Returns the
   * notification id (an existing id when the same event was sent recently).
   */
  async notifyBookingEvent(bookingId: string, event: BookingEvent): Promise<string | null> {
    const { data, error } = await supabase.rpc('notify_booking_event', { p_booking_id: bookingId, p_event: event });
    if (error) throw error;
    return typeof data === 'string' ? data : null;
  }

  async markNotificationAsRead(id: string): Promise<Notification | null> {
    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .select()
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async markAllNotificationsAsRead(email: string): Promise<void> {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('recipient_email', email.toLowerCase());
  }

  // ==================== USERS ====================

  async getUserByEmail(email: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .ilike('email', escapeLikePattern(email))
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async getUserById(id: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async createUser(user: Omit<User, 'id' | 'created_at' | 'is_verified' | 'reset_token' | 'reset_token_expires'> & { id?: string }): Promise<User> {
    const id = user.id || generateId();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('users')
      .insert({
        ...user,
        id,
        is_verified: false,
        created_at: now,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // ==================== MENTOR DASHBOARD ====================

  async getMentorDashboardStats(mentorId: string): Promise<MentorDashboardStats> {
    const { data: bookings } = await supabase
      .from('bookings')
      .select('*')
      .eq('mentor_id', mentorId);

    const allBookings = bookings || [];
    const totalSessions = allBookings.length;
    const completedSessions = allBookings.filter(b => b.status === 'completed').length;
    const pendingBookings = allBookings.filter(b => b.status === 'pending').length;

    const ratingsData = allBookings.filter(b => b.mentee_rating !== null);
    const averageRating = ratingsData.length > 0
      ? ratingsData.reduce((sum, b) => sum + (b.mentee_rating || 0), 0) / ratingsData.length
      : 0;
    const feedbackCount = ratingsData.length;

    // Amazon mentors are volunteers: the programme reports hours, not earnings.
    const completed = allBookings.filter(b => b.status === 'completed');
    const volunteerMinutes = completed.reduce((sum, b) => sum + (b.session_duration_minutes || 0), 0);

    const currentMonth = new Date().toISOString().slice(0, 7);
    const monthlyVolunteerMinutes = completed
      .filter(b => (b.completed_at || b.scheduled_at || '').slice(0, 7) === currentMonth)
      .reduce((sum, b) => sum + (b.session_duration_minutes || 0), 0);

    return {
      totalSessions,
      completedSessions,
      averageRating: Math.round(averageRating * 100) / 100,
      volunteerMinutes,
      monthlyVolunteerMinutes,
      pendingBookings,
      feedbackCount,
    };
  }

  // ==================== MENTOR TASKS ====================

  async getMentorTasks(mentorId: string): Promise<MentorTask[]> {
    const { data, error } = await supabase
      .from('mentor_tasks')
      .select('*')
      .eq('mentor_id', mentorId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async createMentorTask(task: Omit<MentorTask, 'id' | 'created_at' | 'updated_at' | 'completed_at'>): Promise<MentorTask> {
    const id = generateId();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('mentor_tasks')
      .insert({
        ...task,
        id,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateMentorTask(taskId: string, updates: Partial<MentorTask>): Promise<MentorTask | null> {
    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = {
      ...updates,
      updated_at: now,
    };

    if (updates.status === 'completed' && !updates.completed_at) {
      updateData.completed_at = now;
    } else if (updates.status && updates.status !== 'completed') {
      // Re-opening a task clears its completion timestamp
      updateData.completed_at = null;
    }

    const { data, error } = await supabase
      .from('mentor_tasks')
      .update(updateData)
      .eq('id', taskId)
      .select()
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  // ==================== MENTOR AVAILABILITY ====================

  async getMentorAvailabilitySlots(mentorId: string): Promise<MentorAvailability[]> {
    const { data, error } = await supabase
      .from('mentor_availability')
      .select('*')
      .eq('mentor_id', mentorId)
      .order('day_of_week');

    if (error) throw error;
    return data || [];
  }

  /**
   * Replaces all of a mentor's weekly windows in ONE transaction through
   * `set_my_availability` (design §3.2, F13): owner or admin only, at most 28
   * slots, `start < end`, `HH:MM`. A rejected slot (22023 `invalid_slot`)
   * leaves the previous rows intact, where the old delete-then-insert could
   * lose every window on a failed insert.
   */
  async setMentorAvailability(mentorId: string, slots: Omit<MentorAvailability, 'id' | 'created_at' | 'mentor_id'>[]): Promise<MentorAvailability[]> {
    const p_slots = slots.map((slot) => ({
      day_of_week: slot.day_of_week,
      start_time: String(slot.start_time).slice(0, 5),
      end_time: String(slot.end_time).slice(0, 5),
      is_active: slot.is_active !== false,
    }));
    const { data, error } = await supabase.rpc('set_my_availability', { p_mentor_id: mentorId, p_slots });
    if (error) throw error;
    return (Array.isArray(data) ? data : []) as MentorAvailability[];
  }

  // ==================== MENTOR EARNINGS ====================

  /**
   * @deprecated The Amazon programme reports volunteer hours, not earnings; no UI
   * reads this. Rows can only be written by the admin-only `record_mentor_earning` RPC.
   */
  async getMentorEarnings(mentorId: string): Promise<MentorEarnings[]> {
    const { data, error } = await supabase
      .from('mentor_earnings')
      .select('*')
      .eq('mentor_id', mentorId)
      .order('earned_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  // ==================== MENTOR ACTIVITY LOG ====================

  async getMentorActivityLog(mentorId: string, limit: number = 50): Promise<MentorActivityLog[]> {
    const { data, error } = await supabase
      .from('mentor_activity_log')
      .select('*')
      .eq('mentor_id', mentorId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }

  /**
   * Writes an activity entry through the `log_mentor_activity` RPC, which only
   * accepts the mentor themself, a party to the referenced booking, or an admin.
   * Booking lifecycle entries are written automatically by a database trigger.
   */
  async createActivityLog(log: Omit<MentorActivityLog, 'id' | 'created_at'>): Promise<MentorActivityLog> {
    const { data, error } = await supabase.rpc('log_mentor_activity', {
      p_mentor_id: log.mentor_id,
      p_activity_type: log.activity_type,
      p_title: log.title,
      p_description: log.description ?? null,
      p_booking_id: log.booking_id ?? null,
      p_mentee_id: log.mentee_id ?? null,
    });
    if (error) throw error;
    return { ...log, id: String(data), created_at: new Date().toISOString() };
  }
}

// Export singleton instance
export const db = new DatabaseService();


