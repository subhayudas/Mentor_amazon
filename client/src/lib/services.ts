/**
 * Services Layer
 * High-level service functions that combine database operations with business logic
 * These are designed to be used directly by React components via React Query
 */

import {
  db,
  Mentor,
  PublicMentor,
  Mentee,
  Booking,
  BookingEvent,
  BookingNote,
  CompleteBookingOptions,
  Notification,
  MentorActivityLog,
  MentorTask,
  MentorAvailability,
  MentorDashboardStats,
} from './database';
import { auth, AuthUser } from './auth';
import { storage } from './storage';

/**
 * Notifications are written by the database (`notify_booking_event`), never by
 * the client. A notification failure must not undo the action it announces,
 * so this logs and moves on. Only the booking id and event name are logged.
 */
async function notify(bookingId: string, event: BookingEvent): Promise<void> {
  try {
    await db.notifyBookingEvent(bookingId, event);
  } catch {
    console.warn(`Notification "${event}" for booking ${bookingId} was not sent`);
  }
}

/** Maps a legacy notification row shape onto the RPC event it corresponds to. */
function bookingEventFor(type: Notification['type'], recipientType: Notification['recipient_type']): BookingEvent | null {
  switch (type) {
    case 'booking_request':
    case 'booking_accepted':
    case 'booking_rejected':
    case 'booking_confirmed':
    case 'booking_completed':
    case 'booking_canceled':
      return type;
    case 'feedback_received':
      return recipientType === 'mentor' ? 'feedback_received_by_mentor' : 'feedback_received_by_mentee';
    default:
      return null;
  }
}

const STATUS_EVENTS: Partial<Record<Booking['status'], BookingEvent>> = {
  confirmed: 'booking_confirmed',
  completed: 'booking_completed',
  canceled: 'booking_canceled',
};

// ==================== AUTH SERVICES ====================

export const authService = {
  signup: auth.signup.bind(auth),
  login: auth.login.bind(auth),
  logout: auth.logout.bind(auth),
  getCurrentUser: auth.getCurrentUser.bind(auth),
  forgotPassword: auth.forgotPassword.bind(auth),
  resetPassword: auth.resetPassword.bind(auth),
  updateProfileId: auth.updateProfileId.bind(auth),
};

// ==================== MENTOR SERVICES ====================

export const mentorService = {
  // Public directory (mentors_public view: no contact or scheduling data)
  async getAll(filters?: { search?: string; expertise?: string; industry?: string; language?: string }): Promise<PublicMentor[]> {
    return db.getMentors(filters);
  },

  // Public profile by ID
  async getById(id: string): Promise<PublicMentor | null> {
    return db.getMentor(id);
  },

  // Full row by email (RLS: only the owner or an admin gets it)
  async getByEmail(email: string): Promise<Mentor | null> {
    return db.getMentorByEmail(email);
  },

  // Full row for the signed-in mentor
  async getOwn(): Promise<Mentor | null> {
    return db.getOwnMentor();
  },

  // Create new mentor profile
  async create(mentor: Omit<Mentor, 'id' | 'created_at' | 'updated_at' | 'average_rating' | 'total_ratings'>): Promise<Mentor> {
    const newMentor = await db.createMentor(mentor);
    
    // Update user profile_id if we have a logged in user
    const currentUser = await auth.getCurrentUser();
    if (currentUser) {
      await auth.updateProfileId(currentUser.id, newMentor.id);
    }
    
    return newMentor;
  },

  // Update mentor profile
  async update(id: string, updates: Partial<Mentor>): Promise<Mentor | null> {
    return db.updateMentor(id, updates);
  },

  // Toggle availability
  async toggleAvailability(id: string, isAvailable: boolean): Promise<Mentor | null> {
    return db.updateMentorAvailability(id, isAvailable);
  },

  // Get mentor bookings
  async getBookings(mentorId: string, status?: string): Promise<Booking[]> {
    return db.getMentorBookingsWithStatus(mentorId, status);
  },

  // Get pending booking requests
  async getPendingBookings(mentorId: string): Promise<(Booking & { mentee?: Mentee })[]> {
    return db.getPendingBookingsForMentor(mentorId);
  },

  // Get dashboard stats
  async getDashboardStats(mentorId: string): Promise<MentorDashboardStats> {
    return db.getMentorDashboardStats(mentorId);
  },

  // Get feedback received
  async getFeedback(mentorId: string): Promise<(Booking & { mentee?: Mentee })[]> {
    return db.getMentorFeedback(mentorId);
  },

  // Get tasks
  async getTasks(mentorId: string): Promise<MentorTask[]> {
    return db.getMentorTasks(mentorId);
  },

  // Create task
  async createTask(task: Omit<MentorTask, 'id' | 'created_at' | 'updated_at' | 'completed_at'>): Promise<MentorTask> {
    return db.createMentorTask(task);
  },

  // Update task
  async updateTask(taskId: string, updates: Partial<MentorTask>): Promise<MentorTask | null> {
    return db.updateMentorTask(taskId, updates);
  },

  // Get availability slots
  async getAvailability(mentorId: string): Promise<MentorAvailability[]> {
    return db.getMentorAvailabilitySlots(mentorId);
  },

  // Set availability
  async setAvailability(mentorId: string, slots: Omit<MentorAvailability, 'id' | 'created_at' | 'mentor_id'>[]): Promise<MentorAvailability[]> {
    return db.setMentorAvailability(mentorId, slots);
  },

  // Get activity log
  async getActivityLog(mentorId: string, limit?: number) {
    return db.getMentorActivityLog(mentorId, limit);
  },

  // Log an activity entry (booking lifecycle entries are written by the database)
  async logActivity(log: Omit<MentorActivityLog, 'id' | 'created_at'>): Promise<MentorActivityLog> {
    return db.createActivityLog(log);
  },
};

// ==================== MENTEE SERVICES ====================

export const menteeService = {
  // Get all mentees
  async getAll(): Promise<Mentee[]> {
    return db.getMentees();
  },

  // Get mentee by ID
  async getById(id: string): Promise<Mentee | null> {
    return db.getMentee(id);
  },

  // Get mentee by email
  async getByEmail(email: string): Promise<Mentee | null> {
    return db.getMenteeByEmail(email);
  },

  // Create new mentee profile
  async create(mentee: Omit<Mentee, 'id' | 'created_at'>): Promise<Mentee> {
    const newMentee = await db.createMentee(mentee);
    
    // Update user profile_id if we have a logged in user
    const currentUser = await auth.getCurrentUser();
    if (currentUser) {
      await auth.updateProfileId(currentUser.id, newMentee.id);
    }
    
    return newMentee;
  },

  // Update mentee profile
  async update(id: string, updates: Partial<Mentee>): Promise<Mentee | null> {
    return db.updateMentee(id, updates);
  },

  // Get bookings
  async getBookings(menteeId: string, status?: string): Promise<(Booking & { mentor?: Mentor })[]> {
    return db.getMenteeBookings(menteeId, status);
  },

  // Get stats
  async getStats(menteeId: string) {
    return db.getMenteeStats(menteeId);
  },

  // Get feedback received
  async getFeedback(menteeId: string): Promise<(Booking & { mentor?: Mentor })[]> {
    return db.getMenteeFeedback(menteeId);
  },

  // Get or create mentee (useful for booking requests)
  async getOrCreate(email: string, name: string): Promise<Mentee> {
    const existing = await db.getMenteeByEmail(email);
    if (existing) return existing;

    // The caller may not be allowed to read the row (anonymous requester, or a
    // mentor with no booking with this mentee yet), so resolve it server-side.
    const id = await db.resolveMenteeIdForBooking(email, name);
    const readable = await db.getMentee(id);
    return readable ?? {
      id,
      name,
      email,
      user_type: 'individual',
      verification_status: 'unverified',
      timezone: 'UTC',
      languages_spoken: ['English'],
      areas_exploring: ['Career Development'],
      created_at: new Date().toISOString(),
    };
  },
};

// ==================== BOOKING SERVICES ====================

export const bookingService = {
  // Get all bookings
  async getAll(): Promise<Booking[]> {
    return db.getBookings();
  },

  // Get booking by ID
  async getById(id: string): Promise<Booking | null> {
    return db.getBooking(id);
  },

  // Create a booking request
  async createRequest(params: {
    mentor_id: string;
    mentee_name: string;
    mentee_email: string;
    goal: string;
  }): Promise<Booking> {
    // Get or create mentee
    const mentee = await menteeService.getOrCreate(params.mentee_email, params.mentee_name);
    
    // Create booking request; the database notifies the mentor
    const booking = await db.createBookingRequest(params.mentor_id, mentee.id, params.goal);
    await notify(booking.id, 'booking_request');
    
    return booking;
  },

  // Create a direct booking
  async create(params: {
    mentor_id: string;
    mentee_id?: string;
    mentee_name?: string;
    mentee_email?: string;
  }): Promise<Booking> {
    let menteeId = params.mentee_id;
    
    // If mentee_id not provided, look up or create by email
    if (!menteeId && params.mentee_email) {
      const mentee = await menteeService.getOrCreate(
        params.mentee_email,
        params.mentee_name || 'Anonymous'
      );
      menteeId = mentee.id;
    }
    
    if (!menteeId) {
      throw new Error('Either mentee_id or mentee_email is required');
    }
    
    const booking = await db.createBooking({
      mentor_id: params.mentor_id,
      mentee_id: menteeId,
      status: 'pending',
    });
    await notify(booking.id, 'booking_request');
    
    return booking;
  },

  // Accept a booking
  async accept(bookingId: string): Promise<Booking | null> {
    const booking = await db.getBooking(bookingId);
    if (!booking) throw new Error('Booking not found');
    if (booking.status !== 'pending') throw new Error('Booking is not in pending status');
    
    const acceptedBooking = await db.acceptBooking(bookingId);
    // The database builds the message (including the mentor's Cal.com link)
    if (acceptedBooking) await notify(bookingId, 'booking_accepted');
    
    return acceptedBooking;
  },

  // Decline a booking
  async decline(bookingId: string): Promise<Booking | null> {
    const booking = await db.getBooking(bookingId);
    if (!booking) throw new Error('Booking not found');
    if (booking.status !== 'pending') throw new Error('Booking is not in pending status');
    
    const declinedBooking = await db.declineBooking(bookingId);
    if (declinedBooking) await notify(bookingId, 'booking_rejected');
    
    return declinedBooking;
  },

  // Update booking status (notifies the other party for confirmed/completed/canceled)
  async updateStatus(bookingId: string, status: string): Promise<Booking | null> {
    const updated = await db.updateBookingStatus(bookingId, status);
    const event = STATUS_EVENTS[status as Booking['status']];
    if (updated && event) await notify(bookingId, event);
    return updated;
  },

  // Mark a session completed with its real duration (feeds volunteer hours)
  async complete(bookingId: string, options: CompleteBookingOptions): Promise<Booking | null> {
    const completed = await db.completeBooking(bookingId, options);
    if (completed) await notify(bookingId, 'booking_completed');
    return completed;
  },

  // Submit feedback from mentee to mentor
  async submitMenteeFeedback(bookingId: string, rating: number, feedback: string): Promise<Booking | null> {
    const booking = await db.getBooking(bookingId);
    if (!booking) throw new Error('Booking not found');
    
    const updatedBooking = await db.submitMenteeFeedback(bookingId, rating, feedback);
    
    // Update mentor's average rating (a trigger does this too)
    await db.updateMentorRating(booking.mentor_id);
    if (updatedBooking) await notify(bookingId, 'feedback_received_by_mentor');
    
    return updatedBooking;
  },

  // Submit feedback from mentor to mentee
  async submitMentorFeedback(bookingId: string, rating: number, feedback: string): Promise<Booking | null> {
    const booking = await db.getBooking(bookingId);
    if (!booking) throw new Error('Booking not found');
    
    const updatedBooking = await db.submitMentorFeedback(bookingId, rating, feedback);
    if (updatedBooking) await notify(bookingId, 'feedback_received_by_mentee');
    
    return updatedBooking;
  },

  // Get notes for a booking
  async getNotes(bookingId: string): Promise<BookingNote[]> {
    return db.getBookingNotes(bookingId);
  },

  // Add note to booking
  async addNote(note: Omit<BookingNote, 'id' | 'created_at'>): Promise<BookingNote> {
    return db.createBookingNote(note);
  },

  // Update note
  async updateNote(noteId: string, updates: Partial<BookingNote>): Promise<BookingNote | null> {
    return db.updateBookingNote(noteId, updates);
  },

  // Delete note
  async deleteNote(noteId: string): Promise<boolean> {
    return db.deleteBookingNote(noteId);
  },
};

// ==================== NOTIFICATION SERVICES ====================

export const notificationService = {
  // Get notifications for user
  async getAll(email: string): Promise<Notification[]> {
    return db.getNotifications(email);
  },

  // Get unread count
  async getUnreadCount(email: string): Promise<number> {
    return db.getUnreadNotificationCount(email);
  },

  // Mark as read
  async markAsRead(id: string): Promise<Notification | null> {
    return db.markNotificationAsRead(id);
  },

  // Mark all as read
  async markAllAsRead(email: string): Promise<void> {
    return db.markAllNotificationsAsRead(email);
  },

  /**
   * Creates a notification for a booking event through the database RPC. The
   * recipient and text are derived from the booking server-side, so only
   * `type`, `recipient_type` and `booking_id` are used. Anything that is not a
   * booking event (e.g. reminders) throws: there is no client write path.
   */
  async create(notification: Omit<Notification, 'id' | 'created_at' | 'is_read'>): Promise<string | null> {
    const event = bookingEventFor(notification.type, notification.recipient_type);
    if (!event || !notification.booking_id) {
      throw new Error('Notifications can only be created for booking events');
    }
    return db.notifyBookingEvent(notification.booking_id, event);
  },
};

// ==================== FILE UPLOAD SERVICES ====================

export const uploadService = {
  // Upload any file
  async uploadFile(file: File, folder?: string): Promise<string> {
    return storage.uploadFile(file, folder);
  },

  // Upload profile image
  async uploadProfileImage(file: File, userId: string): Promise<string> {
    return storage.uploadProfileImage(file, userId);
  },

  // Delete file
  async deleteFile(url: string): Promise<void> {
    return storage.deleteFile(url);
  },
};

// Export raw database instance for direct access
export { db } from './database';

