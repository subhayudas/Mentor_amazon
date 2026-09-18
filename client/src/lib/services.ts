/**
 * Services Layer
 * High-level service functions that combine database operations with business logic
 * These are designed to be used directly by React components via React Query
 */

import { db, Mentor, Mentee, Booking, BookingNote, Notification, MentorTask, MentorAvailability, MentorDashboardStats } from './database';
import { auth, AuthUser } from './auth';
import { storage } from './storage';

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
  // Get all mentors with optional filters
  async getAll(filters?: { search?: string; expertise?: string; industry?: string; language?: string }): Promise<Mentor[]> {
    return db.getMentors(filters);
  },

  // Get mentor by ID
  async getById(id: string): Promise<Mentor | null> {
    return db.getMentor(id);
  },

  // Get mentor by email
  async getByEmail(email: string): Promise<Mentor | null> {
    return db.getMentorByEmail(email);
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

  // Get earnings
  async getEarnings(mentorId: string) {
    return db.getMentorEarnings(mentorId);
  },

  // Get activity log
  async getActivityLog(mentorId: string, limit?: number) {
    return db.getMentorActivityLog(mentorId, limit);
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
    let mentee = await db.getMenteeByEmail(email);
    if (!mentee) {
      mentee = await db.createMentee({
        name,
        email,
        user_type: 'individual',
        timezone: 'UTC',
        languages_spoken: ['English'],
        areas_exploring: ['Career Development'],
      });
    }
    return mentee;
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
    
    // Create booking request
    const booking = await db.createBookingRequest(params.mentor_id, mentee.id, params.goal);
    
    // Create notification for mentor
    const mentor = await db.getMentor(params.mentor_id);
    if (mentor) {
      await db.createNotification({
        recipient_email: mentor.email,
        recipient_type: 'mentor',
        type: 'booking_request',
        title: 'New Booking Request',
        message: `${mentee.name} has requested a mentorship session with you. Goal: ${params.goal}`,
        booking_id: booking.id,
      });
    }
    
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
    
    // Create notifications
    const mentor = await db.getMentor(params.mentor_id);
    const mentee = await db.getMentee(menteeId);
    
    if (mentor && mentee) {
      await db.createNotification({
        recipient_email: mentor.email,
        recipient_type: 'mentor',
        type: 'booking_request',
        title: 'New Session Booked',
        message: `${mentee.name} has booked a mentorship session with you.`,
        booking_id: booking.id,
      });
      
      await db.createNotification({
        recipient_email: mentee.email,
        recipient_type: 'mentee',
        type: 'booking_request',
        title: 'Session Confirmed',
        message: `Your session with ${mentor.name} has been booked successfully.`,
        booking_id: booking.id,
      });
    }
    
    return booking;
  },

  // Accept a booking
  async accept(bookingId: string): Promise<Booking | null> {
    const booking = await db.getBooking(bookingId);
    if (!booking) throw new Error('Booking not found');
    if (booking.status !== 'pending') throw new Error('Booking is not in pending status');
    
    const acceptedBooking = await db.acceptBooking(bookingId);
    
    // Get mentor and mentee for notification
    const mentor = await db.getMentor(booking.mentor_id);
    const mentee = await db.getMentee(booking.mentee_id);
    
    if (mentor && mentee && acceptedBooking) {
      const calLink = mentor.cal_link ? `https://cal.com/${mentor.cal_link}` : '';
      await db.createNotification({
        recipient_email: mentee.email,
        recipient_type: 'mentee',
        type: 'booking_accepted',
        title: 'Booking Request Accepted',
        message: `${mentor.name} has accepted your mentorship request.${calLink ? ` Schedule your session: ${calLink}` : ''}`,
        booking_id: bookingId,
      });
    }
    
    return acceptedBooking;
  },

  // Decline a booking
  async decline(bookingId: string): Promise<Booking | null> {
    const booking = await db.getBooking(bookingId);
    if (!booking) throw new Error('Booking not found');
    if (booking.status !== 'pending') throw new Error('Booking is not in pending status');
    
    const declinedBooking = await db.declineBooking(bookingId);
    
    // Notify mentee
    const mentor = await db.getMentor(booking.mentor_id);
    const mentee = await db.getMentee(booking.mentee_id);
    
    if (mentor && mentee) {
      await db.createNotification({
        recipient_email: mentee.email,
        recipient_type: 'mentee',
        type: 'booking_rejected',
        title: 'Booking Request Declined',
        message: `${mentor.name} was unable to accept your mentorship request at this time.`,
        booking_id: bookingId,
      });
    }
    
    return declinedBooking;
  },

  // Update booking status
  async updateStatus(bookingId: string, status: string): Promise<Booking | null> {
    return db.updateBookingStatus(bookingId, status);
  },

  // Submit feedback from mentee to mentor
  async submitMenteeFeedback(bookingId: string, rating: number, feedback: string): Promise<Booking | null> {
    const booking = await db.getBooking(bookingId);
    if (!booking) throw new Error('Booking not found');
    
    const updatedBooking = await db.submitMenteeFeedback(bookingId, rating, feedback);
    
    // Update mentor's average rating
    await db.updateMentorRating(booking.mentor_id);
    
    // Create notification for mentor
    const mentor = await db.getMentor(booking.mentor_id);
    const mentee = await db.getMentee(booking.mentee_id);
    
    if (mentor && mentee) {
      await db.createNotification({
        recipient_email: mentor.email,
        recipient_type: 'mentor',
        type: 'feedback_received',
        title: 'New Feedback Received',
        message: `${mentee.name} has left you feedback and rated your session ${rating}/5 stars.${feedback ? ` Their feedback: "${feedback}"` : ''}`,
        booking_id: bookingId,
      });
    }
    
    return updatedBooking;
  },

  // Submit feedback from mentor to mentee
  async submitMentorFeedback(bookingId: string, rating: number, feedback: string): Promise<Booking | null> {
    const booking = await db.getBooking(bookingId);
    if (!booking) throw new Error('Booking not found');
    
    const updatedBooking = await db.submitMentorFeedback(bookingId, rating, feedback);
    
    // Create notification for mentee
    const mentor = await db.getMentor(booking.mentor_id);
    const mentee = await db.getMentee(booking.mentee_id);
    
    if (mentor && mentee) {
      await db.createNotification({
        recipient_email: mentee.email,
        recipient_type: 'mentee',
        type: 'feedback_received',
        title: 'New Feedback from Mentor',
        message: `${mentor.name} has left you feedback and rated your session ${rating}/5 stars.${feedback ? ` Their feedback: "${feedback}"` : ''}`,
        booking_id: bookingId,
      });
    }
    
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

  // Create notification
  async create(notification: Omit<Notification, 'id' | 'created_at' | 'is_read'>): Promise<Notification> {
    return db.createNotification(notification);
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

