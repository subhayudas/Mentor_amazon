/**
 * Frontend Database Service
 * Handles all database operations directly from the client using Supabase
 */

import { supabase } from './supabase';

// Type definitions based on the database schema
export interface Mentor {
  id: string;
  name: string;
  name_ar?: string;
  email: string;
  company?: string;
  company_ar?: string;
  position?: string;
  position_ar?: string;
  timezone: string;
  country?: string;
  photo_url?: string;
  bio: string;
  bio_ar?: string;
  linkedin_url?: string;
  cal_link: string;
  cal_15min?: string;
  cal_30min?: string;
  cal_60min?: string;
  expertise: string[];
  expertise_ar?: string[];
  industries: string[];
  industries_ar?: string[];
  languages_spoken: string[];
  comms_owner: 'exec' | 'assistant';
  assistant_email?: string;
  mentorship_preference?: 'ongoing' | 'rotating' | 'either';
  why_joined?: string;
  is_available: boolean;
  average_rating?: string;
  total_ratings?: number;
  created_at: string;
  updated_at: string;
}

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

export interface MentorDashboardStats {
  totalSessions: number;
  completedSessions: number;
  averageRating: number;
  totalEarnings: number;
  monthlyEarnings: number;
  pendingBookings: number;
  feedbackCount: number;
}

// Helper to generate UUIDs
function generateId(): string {
  return crypto.randomUUID();
}

// Database Service Class
class DatabaseService {
  // ==================== MENTORS ====================
  
  async getMentors(filters?: { search?: string; expertise?: string; industry?: string; language?: string }): Promise<Mentor[]> {
    let query = supabase.from('mentors').select('*');

    if (filters?.search) {
      const searchPattern = `%${filters.search}%`;
      query = query.or(`name.ilike.${searchPattern},position.ilike.${searchPattern},company.ilike.${searchPattern},bio.ilike.${searchPattern}`);
    }

    if (filters?.expertise) {
      query = query.contains('expertise', [filters.expertise]);
    }

    if (filters?.industry) {
      query = query.contains('industries', [filters.industry]);
    }

    if (filters?.language) {
      query = query.contains('languages_spoken', [filters.language]);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async getMentor(id: string): Promise<Mentor | null> {
    const { data, error } = await supabase
      .from('mentors')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async getMentorByEmail(email: string): Promise<Mentor | null> {
    const { data, error } = await supabase
      .from('mentors')
      .select('*')
      .eq('email', email)
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

  async updateMentorRating(mentorId: string): Promise<void> {
    const { data: bookings } = await supabase
      .from('bookings')
      .select('mentee_rating')
      .eq('mentor_id', mentorId)
      .not('mentee_rating', 'is', null);

    if (!bookings || bookings.length === 0) return;

    const totalRating = bookings.reduce((sum, b) => sum + (b.mentee_rating || 0), 0);
    const avgRating = totalRating / bookings.length;

    await supabase
      .from('mentors')
      .update({
        average_rating: avgRating.toFixed(2),
        total_ratings: bookings.length,
      })
      .eq('id', mentorId);
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
      .eq('email', email)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async createMentee(mentee: Omit<Mentee, 'id' | 'created_at'>): Promise<Mentee> {
    const id = generateId();
    const now = new Date().toISOString();
    
    const { data, error } = await supabase
      .from('mentees')
      .insert({
        ...mentee,
        id,
        created_at: now,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
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

  async createBooking(booking: Omit<Booking, 'id' | 'created_at'>): Promise<Booking> {
    const id = generateId();
    const now = new Date().toISOString();
    
    const { data, error } = await supabase
      .from('bookings')
      .insert({
        ...booking,
        id,
        clicked_at: now,
        created_at: now,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async createBookingRequest(mentorId: string, menteeId: string, goal: string): Promise<Booking> {
    const id = generateId();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('bookings')
      .insert({
        id,
        mentor_id: mentorId,
        mentee_id: menteeId,
        goal,
        status: 'pending',
        created_at: now,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
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

  async getMentorBookingsWithStatus(mentorId: string, status?: string): Promise<Booking[]> {
    let query = supabase
      .from('bookings')
      .select('*')
      .eq('mentor_id', mentorId);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async getMenteeBookings(menteeId: string, status?: string): Promise<(Booking & { mentor?: Mentor })[]> {
    let query = supabase
      .from('bookings')
      .select('*, mentor:mentors(*)')
      .eq('mentee_id', menteeId);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
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
    const { data, error } = await supabase
      .from('bookings')
      .select('*, mentor:mentors(*)')
      .eq('mentee_id', menteeId)
      .not('mentor_rating', 'is', null)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async findAndConfirmAcceptedBooking(
    mentorId: string,
    menteeEmail: string,
    calEventUri?: string,
    scheduledAt?: string
  ): Promise<Booking | null> {
    const mentee = await this.getMenteeByEmail(menteeEmail);
    if (!mentee) return null;

    const { data: bookings } = await supabase
      .from('bookings')
      .select('*')
      .eq('mentor_id', mentorId)
      .eq('mentee_id', mentee.id)
      .eq('status', 'accepted')
      .order('created_at', { ascending: false })
      .limit(1);

    if (!bookings || bookings.length === 0) return null;

    const booking = bookings[0];
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('bookings')
      .update({
        status: 'confirmed',
        cal_event_uri: calEventUri,
        scheduled_at: scheduledAt,
        responded_at: now,
      })
      .eq('id', booking.id)
      .select()
      .single();

    if (error) throw error;
    return data;
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

  async getNotifications(email: string): Promise<Notification[]> {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_email', email)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async getUnreadNotificationCount(email: string): Promise<number> {
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_email', email)
      .eq('is_read', false);

    if (error) throw error;
    return count || 0;
  }

  async createNotification(notification: Omit<Notification, 'id' | 'created_at' | 'is_read'>): Promise<Notification> {
    const id = generateId();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('notifications')
      .insert({
        ...notification,
        id,
        is_read: false,
        created_at: now,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
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
      .eq('recipient_email', email);
  }

  // ==================== USERS ====================

  async getUserByEmail(email: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
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

    const { data: earnings } = await supabase
      .from('mentor_earnings')
      .select('*')
      .eq('mentor_id', mentorId);

    const earningsData = earnings || [];
    const totalEarnings = earningsData.reduce((sum, e) => sum + parseFloat(e.amount), 0);

    const currentMonth = new Date().toISOString().slice(0, 7);
    const monthlyEarnings = earningsData
      .filter(e => e.payout_month === currentMonth)
      .reduce((sum, e) => sum + parseFloat(e.amount), 0);

    return {
      totalSessions,
      completedSessions,
      averageRating: Math.round(averageRating * 100) / 100,
      totalEarnings,
      monthlyEarnings,
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

  async setMentorAvailability(mentorId: string, slots: Omit<MentorAvailability, 'id' | 'created_at' | 'mentor_id'>[]): Promise<MentorAvailability[]> {
    // Delete existing availability
    await supabase
      .from('mentor_availability')
      .delete()
      .eq('mentor_id', mentorId);

    if (slots.length === 0) return [];

    const now = new Date().toISOString();
    const slotsWithIds = slots.map(slot => ({
      ...slot,
      id: generateId(),
      mentor_id: mentorId,
      created_at: now,
    }));

    const { data, error } = await supabase
      .from('mentor_availability')
      .insert(slotsWithIds)
      .select();

    if (error) throw error;
    return data || [];
  }

  // ==================== MENTOR EARNINGS ====================

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

  async createActivityLog(log: Omit<MentorActivityLog, 'id' | 'created_at'>): Promise<MentorActivityLog> {
    const id = generateId();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('mentor_activity_log')
      .insert({
        ...log,
        id,
        created_at: now,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}

// Export singleton instance
export const db = new DatabaseService();


