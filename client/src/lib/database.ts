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
  user_type: 'mentor' | 'mentee';
  profile_id?: string;
  is_verified: boolean;
  reset_token?: string;
  reset_token_expires?: string;
  created_at: string;
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
    const updateData: Partial<MentorTask> = {
      ...updates,
      updated_at: now,
    };

    if (updates.status === 'completed' && !updates.completed_at) {
      updateData.completed_at = now;
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

  // ==================== SEED DATABASE ====================

  async seedDatabase(): Promise<{ seeded: boolean; mentorCount: number }> {
    try {
      // Check if mentors already exist
      const { data: existingMentors, error: checkError } = await supabase
        .from('mentors')
        .select('id')
        .limit(1);

      if (checkError) throw checkError;

      if (existingMentors && existingMentors.length > 0) {
        return { seeded: false, mentorCount: 0 };
      }

      const seedMentors = [
        {
          name: "Vats Shah",
          name_ar: "فاتس شاه",
          email: "vats.shah@amazon.com",
          company: "Amazon",
          company_ar: "أمازون",
          position: "Senior Product Manager",
          position_ar: "مدير منتجات أول",
          timezone: "Asia/Dubai",
          country: "United Arab Emirates",
          photo_url: "/attached_assets/image_1763386758212.png",
          bio: "Leading product development for Amazon's Middle East marketplace. 8+ years of experience in e-commerce and digital transformation. Passionate about mentoring aspiring product managers in the MENA region.",
          bio_ar: "قيادة تطوير المنتجات لسوق أمازون في الشرق الأوسط. أكثر من 8 سنوات من الخبرة في التجارة الإلكترونية والتحول الرقمي. شغوف بتوجيه مديري المنتجات الطموحين في منطقة الشرق الأوسط وشمال أفريقيا.",
          linkedin_url: "https://linkedin.com/in/vatsshah",
          cal_link: "vats-s.-shah-2krirj/30min",
          cal_15min: "vats-s.-shah-2krirj/30min",
          cal_30min: "vats-s.-shah-2krirj/30min",
          cal_60min: "vats-s.-shah-2krirj/30min",
          expertise: ["Product Management", "E-commerce", "Digital Transformation", "Agile Methodologies", "Market Strategy"],
          expertise_ar: ["إدارة المنتجات", "التجارة الإلكترونية", "التحول الرقمي", "منهجيات أجايل", "استراتيجية السوق"],
          industries: ["E-commerce", "Technology", "Retail"],
          industries_ar: ["التجارة الإلكترونية", "التكنولوجيا", "التجزئة"],
          languages_spoken: ["English", "Hindi"],
          comms_owner: "exec" as const,
          mentorship_preference: "rotating" as const,
          is_available: true,
        },
        {
          name: "Layla Mahmoud",
          name_ar: "ليلى محمود",
          email: "layla.mahmoud@amazon.com",
          company: "Amazon",
          company_ar: "أمازون",
          position: "Engineering Manager, AWS",
          position_ar: "مديرة هندسة، AWS",
          timezone: "Asia/Dubai",
          country: "United Arab Emirates",
          photo_url: "/attached_assets/image_1763386693493.png",
          bio: "Building scalable cloud infrastructure for AWS customers across EMEA. 10+ years in distributed systems and team leadership. I mentor engineers on career growth, system design, and technical excellence.",
          bio_ar: "بناء بنية تحتية سحابية قابلة للتوسع لعملاء AWS في منطقة أوروبا والشرق الأوسط وأفريقيا. أكثر من 10 سنوات في الأنظمة الموزعة وقيادة الفرق. أقوم بتوجيه المهندسين حول النمو المهني وتصميم الأنظمة والتميز التقني.",
          linkedin_url: "https://linkedin.com/in/laylamahmoud",
          cal_link: "layla-mahmoud/30min",
          cal_15min: "layla-mahmoud/15min",
          cal_30min: "layla-mahmoud/30min",
          cal_60min: "layla-mahmoud/60min",
          expertise: ["Cloud Computing", "System Design", "Engineering Leadership", "AWS Services", "DevOps"],
          expertise_ar: ["الحوسبة السحابية", "تصميم الأنظمة", "القيادة الهندسية", "خدمات AWS", "DevOps"],
          industries: ["Cloud Computing", "Technology", "Infrastructure"],
          industries_ar: ["الحوسبة السحابية", "التكنولوجيا", "البنية التحتية"],
          languages_spoken: ["English", "Arabic", "French"],
          comms_owner: "exec" as const,
          mentorship_preference: "ongoing" as const,
          is_available: true,
        },
        {
          name: "Omar Khalil",
          name_ar: "عمر خليل",
          email: "omar.khalil@amazon.com",
          company: "Amazon",
          company_ar: "أمازون",
          position: "Senior UX Designer",
          position_ar: "مصمم تجربة مستخدم أول",
          timezone: "Africa/Cairo",
          country: "Egypt",
          photo_url: "/attached_assets/image_1763386720221.png",
          bio: "Crafting localized shopping experiences for Middle East customers. Specializing in Arabic UX, accessibility, and cross-cultural design. Happy to help designers navigate the unique challenges of regional markets.",
          bio_ar: "تصميم تجارب تسوق محلية لعملاء الشرق الأوسط. متخصص في تجربة المستخدم العربية وإمكانية الوصول والتصميم عبر الثقافات. سعيد بمساعدة المصممين في التعامل مع التحديات الفريدة للأسواق الإقليمية.",
          linkedin_url: "https://linkedin.com/in/omarkhalil",
          cal_link: "omar-khalil/30min",
          cal_15min: "omar-khalil/15min",
          cal_30min: "omar-khalil/30min",
          cal_60min: "omar-khalil/60min",
          expertise: ["UX Design", "Localization", "Design Systems", "User Research", "Accessibility"],
          expertise_ar: ["تصميم تجربة المستخدم", "التوطين", "أنظمة التصميم", "بحث المستخدم", "إمكانية الوصول"],
          industries: ["E-commerce", "Technology", "Design"],
          industries_ar: ["التجارة الإلكترونية", "التكنولوجيا", "التصميم"],
          languages_spoken: ["English", "Arabic"],
          comms_owner: "assistant" as const,
          mentorship_preference: "rotating" as const,
          is_available: true,
        },
        {
          name: "Levi Lewandowski",
          name_ar: "ليفي ليفاندوفسكي",
          email: "levi.lewandowski@amazon.com",
          company: "Amazon",
          company_ar: "أمازون",
          position: "Strategic Partnerships Lead",
          position_ar: "قائد الشراكات الاستراتيجية",
          timezone: "America/New_York",
          country: "United States",
          photo_url: "/attached_assets/image_1763387494054.png",
          bio: "Building strategic partnerships and accelerating growth initiatives for Amazon's innovation programs. Expert in startup ecosystems, venture partnerships, and business development. I mentor entrepreneurs and partnership professionals on scaling strategies.",
          bio_ar: "بناء الشراكات الاستراتيجية وتسريع مبادرات النمو لبرامج الابتكار في أمازون. خبير في منظومات الشركات الناشئة وشراكات رأس المال الجريء وتطوير الأعمال. أقوم بتوجيه رواد الأعمال ومحترفي الشراكات حول استراتيجيات التوسع.",
          linkedin_url: "https://linkedin.com/in/levilewandowski",
          cal_link: "levi-lewandowski/30min",
          cal_15min: "levi-lewandowski/15min",
          cal_30min: "levi-lewandowski/30min",
          cal_60min: "levi-lewandowski/60min",
          expertise: ["Strategic Partnerships", "Business Development", "Startup Ecosystems", "Innovation Programs", "Venture Relations"],
          expertise_ar: ["الشراكات الاستراتيجية", "تطوير الأعمال", "منظومات الشركات الناشئة", "برامج الابتكار", "علاقات رأس المال الجريء"],
          industries: ["Technology", "Startups", "Innovation"],
          industries_ar: ["التكنولوجيا", "الشركات الناشئة", "الابتكار"],
          languages_spoken: ["English"],
          comms_owner: "exec" as const,
          mentorship_preference: "rotating" as const,
          is_available: true,
        },
        {
          name: "Karim Nasser",
          name_ar: "كريم ناصر",
          email: "karim.nasser@amazon.com",
          company: "Amazon",
          company_ar: "أمازون",
          position: "Data Science Lead",
          position_ar: "قائد علوم البيانات",
          timezone: "Africa/Cairo",
          country: "Egypt",
          photo_url: "/attached_assets/image_1763386661657.png",
          bio: "Building recommendation systems and predictive models for Amazon's Middle East operations. 12+ years in machine learning and analytics. I help data professionals develop ML skills and advance their careers.",
          bio_ar: "بناء أنظمة التوصيات والنماذج التنبؤية لعمليات أمازون في الشرق الأوسط. أكثر من 12 عاماً في تعلم الآلة والتحليلات. أساعد محترفي البيانات على تطوير مهارات ML والتقدم في حياتهم المهنية.",
          linkedin_url: "https://linkedin.com/in/karimnasser",
          cal_link: "karim-nasser/30min",
          cal_15min: "karim-nasser/15min",
          cal_30min: "karim-nasser/30min",
          cal_60min: "karim-nasser/60min",
          expertise: ["Machine Learning", "Data Science", "Predictive Analytics", "Recommendation Systems", "Python"],
          expertise_ar: ["تعلم الآلة", "علوم البيانات", "التحليلات التنبؤية", "أنظمة التوصيات", "بايثون"],
          industries: ["Technology", "E-commerce", "Data Analytics"],
          industries_ar: ["التكنولوجيا", "التجارة الإلكترونية", "تحليلات البيانات"],
          languages_spoken: ["English", "Arabic"],
          comms_owner: "exec" as const,
          mentorship_preference: "ongoing" as const,
          is_available: true,
        },
        {
          name: "Nour Ibrahim",
          name_ar: "نور إبراهيم",
          email: "nour.ibrahim@amazon.com",
          company: "Amazon",
          company_ar: "أمازون",
          position: "Operations Manager, Fulfillment",
          position_ar: "مديرة العمليات، التوزيع",
          timezone: "Asia/Dubai",
          country: "United Arab Emirates",
          photo_url: "/attached_assets/image_1763386772495.png",
          bio: "Optimizing logistics and supply chain operations across Middle East fulfillment centers. Expert in operational excellence, process improvement, and team management. Mentoring operations professionals on leadership and efficiency.",
          bio_ar: "تحسين عمليات اللوجستيات وسلسلة التوريد في مراكز التوزيع بالشرق الأوسط. خبيرة في التميز التشغيلي وتحسين العمليات وإدارة الفرق. أقوم بتوجيه محترفي العمليات حول القيادة والكفاءة.",
          linkedin_url: "https://linkedin.com/in/nouribrahim",
          cal_link: "nour-ibrahim/30min",
          cal_15min: "nour-ibrahim/15min",
          cal_30min: "nour-ibrahim/30min",
          cal_60min: "nour-ibrahim/60min",
          expertise: ["Operations Management", "Supply Chain", "Logistics", "Process Improvement", "Leadership"],
          expertise_ar: ["إدارة العمليات", "سلسلة التوريد", "اللوجستيات", "تحسين العمليات", "القيادة"],
          industries: ["E-commerce", "Logistics", "Operations"],
          industries_ar: ["التجارة الإلكترونية", "اللوجستيات", "العمليات"],
          languages_spoken: ["English", "Arabic"],
          comms_owner: "assistant" as const,
          mentorship_preference: "rotating" as const,
          is_available: true,
        },
        {
          name: "Youssef Fahmy",
          name_ar: "يوسف فهمي",
          email: "youssef.fahmy@amazon.com",
          company: "Amazon",
          company_ar: "أمازون",
          position: "Senior Business Analyst",
          position_ar: "محلل أعمال أول",
          timezone: "Africa/Cairo",
          country: "Egypt",
          photo_url: "/attached_assets/image_1763386732789.png",
          bio: "Transforming data into strategic insights for retail operations. Specialized in business intelligence, SQL, and data visualization. I mentor analysts on technical skills and business acumen.",
          bio_ar: "تحويل البيانات إلى رؤى استراتيجية لعمليات التجزئة. متخصص في ذكاء الأعمال وSQL وتصور البيانات. أقوم بتوجيه المحللين حول المهارات التقنية والفطنة التجارية.",
          linkedin_url: "https://linkedin.com/in/yousseffahmy",
          cal_link: "youssef-fahmy/30min",
          cal_15min: "youssef-fahmy/15min",
          cal_30min: "youssef-fahmy/30min",
          cal_60min: "youssef-fahmy/60min",
          expertise: ["Business Analysis", "Data Analytics", "SQL", "Business Intelligence", "Data Visualization"],
          expertise_ar: ["تحليل الأعمال", "تحليلات البيانات", "SQL", "ذكاء الأعمال", "تصور البيانات"],
          industries: ["E-commerce", "Retail", "Analytics"],
          industries_ar: ["التجارة الإلكترونية", "التجزئة", "التحليلات"],
          languages_spoken: ["English", "Arabic"],
          comms_owner: "exec" as const,
          mentorship_preference: "ongoing" as const,
          is_available: true,
        },
      ];

      const now = new Date().toISOString();
      const mentorsToInsert = seedMentors.map(mentor => ({
        ...mentor,
        id: generateId(),
        average_rating: '0',
        total_ratings: 0,
        created_at: now,
        updated_at: now,
      }));

      const { error: insertError } = await supabase
        .from('mentors')
        .insert(mentorsToInsert);

      if (insertError) throw insertError;

      return { seeded: true, mentorCount: seedMentors.length };
    } catch (error) {
      console.error('Error seeding database:', error);
      throw error;
    }
  }

  async checkAndSeed(): Promise<void> {
    try {
      const result = await this.seedDatabase();
      if (result.seeded) {
        console.log(`Database seeded with ${result.mentorCount} mentors`);
      } else {
        console.log('Database already has data, skipping seed');
      }
    } catch (error) {
      console.error('Failed to seed database:', error);
    }
  }
}

// Export singleton instance
export const db = new DatabaseService();

// Auto-seed on module load (development only -- never in a deployed build)
if (import.meta.env.DEV && typeof window !== 'undefined') {
  db.checkAndSeed();
}

