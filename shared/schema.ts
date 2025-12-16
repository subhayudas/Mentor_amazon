import { pgTable, text, varchar, timestamp, integer, decimal, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const mentors = pgTable("mentors", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  name_ar: text("name_ar"),
  email: text("email").notNull().unique(),
  company: text("company"),
  company_ar: text("company_ar"),
  position: text("position"),
  position_ar: text("position_ar"),
  timezone: text("timezone").notNull(),
  country: text("country"),
  photo_url: text("photo_url"),
  bio: text("bio").notNull(),
  bio_ar: text("bio_ar"),
  linkedin_url: text("linkedin_url"),
  cal_link: text("cal_link").notNull(),
  cal_15min: text("cal_15min"),
  cal_30min: text("cal_30min"),
  cal_60min: text("cal_60min"),
  expertise: text("expertise").array().notNull(),
  expertise_ar: text("expertise_ar").array(),
  industries: text("industries").array().notNull(),
  industries_ar: text("industries_ar").array(),
  languages_spoken: text("languages_spoken").array().notNull(),
  comms_owner: text("comms_owner", { enum: ["exec", "assistant"] }).notNull(),
  assistant_email: text("assistant_email"),
  mentorship_preference: text("mentorship_preference", { enum: ["ongoing", "rotating", "either"] }),
  why_joined: text("why_joined"),
  is_available: boolean("is_available").default(true).notNull(),
  average_rating: decimal("average_rating", { precision: 3, scale: 2 }).default("0"),
  total_ratings: integer("total_ratings").default(0),
  created_at: timestamp("created_at", { mode: "string" }).notNull(),
  updated_at: timestamp("updated_at", { mode: "string" }).notNull(),
});

export const mentees = pgTable("mentees", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  user_type: text("user_type", { enum: ["individual", "organization"] }).notNull(),
  organization_name: text("organization_name"),
  organization_website: text("organization_website"),
  organization_sector: text("organization_sector"),
  organization_size: text("organization_size"),
  organization_mission: text("organization_mission"),
  organization_needs: text("organization_needs"),
  country: text("country"),
  timezone: text("timezone").notNull(),
  photo_url: text("photo_url"),
  bio: text("bio"),
  linkedin_url: text("linkedin_url"),
  languages_spoken: text("languages_spoken").array().notNull(),
  areas_exploring: text("areas_exploring").array().notNull(),
  goals: text("goals"),
  created_at: timestamp("created_at", { mode: "string" }).notNull(),
});

export const bookings = pgTable("bookings", {
  id: varchar("id").primaryKey(),
  mentor_id: varchar("mentor_id").notNull().references(() => mentors.id),
  mentee_id: varchar("mentee_id").notNull().references(() => mentees.id),
  cal_event_uri: text("cal_event_uri"),
  status: text("status", { 
    enum: ["clicked", "scheduled", "completed", "canceled"] 
  }).notNull().default("clicked"),
  scheduled_at: timestamp("scheduled_at", { mode: "string" }),
  clicked_at: timestamp("clicked_at", { mode: "string" }).notNull(),
  completed_at: timestamp("completed_at", { mode: "string" }),
  canceled_at: timestamp("canceled_at", { mode: "string" }),
  mentee_rating: integer("mentee_rating"),
  mentee_feedback: text("mentee_feedback"),
  created_at: timestamp("created_at", { mode: "string" }).notNull(),
});

export const bookingNotes = pgTable("booking_notes", {
  id: varchar("id").primaryKey(),
  booking_id: varchar("booking_id").notNull().references(() => bookings.id),
  author_type: text("author_type", { enum: ["mentor", "mentee"] }).notNull(),
  author_email: text("author_email").notNull(),
  note_type: text("note_type", { enum: ["note", "task"] }).notNull().default("note"),
  content: text("content").notNull(),
  is_completed: boolean("is_completed").default(false),
  due_date: timestamp("due_date", { mode: "string" }),
  created_at: timestamp("created_at", { mode: "string" }).notNull(),
});

export const mentorsRelations = relations(mentors, ({ many }) => ({
  bookings: many(bookings),
}));

export const menteesRelations = relations(mentees, ({ many }) => ({
  bookings: many(bookings),
}));

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  mentor: one(mentors, {
    fields: [bookings.mentor_id],
    references: [mentors.id],
  }),
  mentee: one(mentees, {
    fields: [bookings.mentee_id],
    references: [mentees.id],
  }),
  notes: many(bookingNotes),
}));

export const bookingNotesRelations = relations(bookingNotes, ({ one }) => ({
  booking: one(bookings, {
    fields: [bookingNotes.booking_id],
    references: [bookings.id],
  }),
}));

export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey(),
  recipient_email: text("recipient_email").notNull(),
  recipient_type: text("recipient_type", { enum: ["mentor", "mentee"] }).notNull(),
  type: text("type", { enum: ["booking_created", "booking_completed", "booking_canceled", "reminder"] }).notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  booking_id: varchar("booking_id").references(() => bookings.id),
  is_read: boolean("is_read").default(false).notNull(),
  created_at: timestamp("created_at", { mode: "string" }).notNull(),
});

export const notificationsRelations = relations(notifications, ({ one }) => ({
  booking: one(bookings, {
    fields: [notifications.booking_id],
    references: [bookings.id],
  }),
}));

export const users = pgTable("users", {
  id: varchar("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  user_type: text("user_type", { enum: ["mentor", "mentee"] }).notNull(),
  profile_id: varchar("profile_id"),
  is_verified: boolean("is_verified").default(false).notNull(),
  reset_token: text("reset_token"),
  reset_token_expires: timestamp("reset_token_expires", { mode: "string" }),
  created_at: timestamp("created_at", { mode: "string" }).notNull(),
});

export const usersRelations = relations(users, ({ one }) => ({
  mentorProfile: one(mentors, {
    fields: [users.profile_id],
    references: [mentors.id],
  }),
  menteeProfile: one(mentees, {
    fields: [users.profile_id],
    references: [mentees.id],
  }),
}));

export const mentorAvailability = pgTable("mentor_availability", {
  id: varchar("id").primaryKey(),
  mentor_id: varchar("mentor_id").notNull().references(() => mentors.id),
  day_of_week: integer("day_of_week").notNull(),
  start_time: text("start_time").notNull(),
  end_time: text("end_time").notNull(),
  is_active: boolean("is_active").default(true).notNull(),
  created_at: timestamp("created_at", { mode: "string" }).notNull(),
});

export const mentorTasks = pgTable("mentor_tasks", {
  id: varchar("id").primaryKey(),
  mentor_id: varchar("mentor_id").notNull().references(() => mentors.id),
  mentee_id: varchar("mentee_id").references(() => mentees.id),
  booking_id: varchar("booking_id").references(() => bookings.id),
  title: text("title").notNull(),
  description: text("description"),
  due_date: timestamp("due_date", { mode: "string" }),
  status: text("status", { enum: ["pending", "in_progress", "completed", "canceled"] }).notNull().default("pending"),
  priority: text("priority", { enum: ["low", "medium", "high"] }).notNull().default("medium"),
  created_at: timestamp("created_at", { mode: "string" }).notNull(),
  updated_at: timestamp("updated_at", { mode: "string" }).notNull(),
  completed_at: timestamp("completed_at", { mode: "string" }),
});

export const mentorEarnings = pgTable("mentor_earnings", {
  id: varchar("id").primaryKey(),
  mentor_id: varchar("mentor_id").notNull().references(() => mentors.id),
  booking_id: varchar("booking_id").references(() => bookings.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  earned_at: timestamp("earned_at", { mode: "string" }).notNull(),
  payout_month: text("payout_month").notNull(),
  payout_status: text("payout_status", { enum: ["pending", "paid"] }).notNull().default("pending"),
});

export const mentorActivityLog = pgTable("mentor_activity_log", {
  id: varchar("id").primaryKey(),
  mentor_id: varchar("mentor_id").notNull().references(() => mentors.id),
  mentee_id: varchar("mentee_id").references(() => mentees.id),
  booking_id: varchar("booking_id").references(() => bookings.id),
  activity_type: text("activity_type", { 
    enum: ["booking_received", "booking_confirmed", "booking_completed", "booking_canceled", "task_created", "task_completed", "rating_received"] 
  }).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  created_at: timestamp("created_at", { mode: "string" }).notNull(),
});

export const mentorAvailabilityRelations = relations(mentorAvailability, ({ one }) => ({
  mentor: one(mentors, {
    fields: [mentorAvailability.mentor_id],
    references: [mentors.id],
  }),
}));

export const mentorTasksRelations = relations(mentorTasks, ({ one }) => ({
  mentor: one(mentors, {
    fields: [mentorTasks.mentor_id],
    references: [mentors.id],
  }),
  mentee: one(mentees, {
    fields: [mentorTasks.mentee_id],
    references: [mentees.id],
  }),
  booking: one(bookings, {
    fields: [mentorTasks.booking_id],
    references: [bookings.id],
  }),
}));

export const mentorEarningsRelations = relations(mentorEarnings, ({ one }) => ({
  mentor: one(mentors, {
    fields: [mentorEarnings.mentor_id],
    references: [mentors.id],
  }),
  booking: one(bookings, {
    fields: [mentorEarnings.booking_id],
    references: [bookings.id],
  }),
}));

export const mentorActivityLogRelations = relations(mentorActivityLog, ({ one }) => ({
  mentor: one(mentors, {
    fields: [mentorActivityLog.mentor_id],
    references: [mentors.id],
  }),
  mentee: one(mentees, {
    fields: [mentorActivityLog.mentee_id],
    references: [mentees.id],
  }),
  booking: one(bookings, {
    fields: [mentorActivityLog.booking_id],
    references: [bookings.id],
  }),
}));

export const insertMentorSchema = createInsertSchema(mentors).omit({
  id: true,
  created_at: true,
  updated_at: true,
  average_rating: true,
  total_ratings: true,
});

export const insertMenteeSchema = createInsertSchema(mentees).omit({
  id: true,
  created_at: true,
});

export const insertBookingSchema = createInsertSchema(bookings).omit({
  id: true,
  created_at: true,
  clicked_at: true,
});

export const insertBookingNoteSchema = createInsertSchema(bookingNotes).omit({
  id: true,
  created_at: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  created_at: true,
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  created_at: true,
  is_verified: true,
  reset_token: true,
  reset_token_expires: true,
});

export const insertMentorAvailabilitySchema = createInsertSchema(mentorAvailability).omit({
  id: true,
  created_at: true,
});

export const insertMentorTaskSchema = createInsertSchema(mentorTasks).omit({
  id: true,
  created_at: true,
  updated_at: true,
  completed_at: true,
});

export const insertMentorEarningsSchema = createInsertSchema(mentorEarnings).omit({
  id: true,
});

export const insertMentorActivityLogSchema = createInsertSchema(mentorActivityLog).omit({
  id: true,
  created_at: true,
});

export type InsertMentor = z.infer<typeof insertMentorSchema>;
export type Mentor = typeof mentors.$inferSelect;
export type InsertMentee = z.infer<typeof insertMenteeSchema>;
export type Mentee = typeof mentees.$inferSelect;
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookings.$inferSelect;
export type InsertBookingNote = z.infer<typeof insertBookingNoteSchema>;
export type BookingNote = typeof bookingNotes.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertMentorAvailability = z.infer<typeof insertMentorAvailabilitySchema>;
export type MentorAvailability = typeof mentorAvailability.$inferSelect;
export type InsertMentorTask = z.infer<typeof insertMentorTaskSchema>;
export type MentorTask = typeof mentorTasks.$inferSelect;
export type InsertMentorEarnings = z.infer<typeof insertMentorEarningsSchema>;
export type MentorEarnings = typeof mentorEarnings.$inferSelect;
export type InsertMentorActivityLog = z.infer<typeof insertMentorActivityLogSchema>;
export type MentorActivityLog = typeof mentorActivityLog.$inferSelect;
