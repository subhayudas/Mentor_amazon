import { pgTable, text, varchar, timestamp, integer, decimal } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const mentors = pgTable("mentors", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  company: text("company"),
  position: text("position"),
  timezone: text("timezone").notNull(),
  photo_url: text("photo_url"),
  bio: text("bio").notNull(),
  linkedin_url: text("linkedin_url"),
  calendly_link: text("calendly_link").notNull(),
  expertise: text("expertise").array().notNull(),
  industries: text("industries").array().notNull(),
  languages_spoken: text("languages_spoken").array().notNull(),
  comms_owner: text("comms_owner", { enum: ["exec", "assistant"] }).notNull(),
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
  timezone: text("timezone").notNull(),
  photo_url: text("photo_url"),
  bio: text("bio"),
  linkedin_url: text("linkedin_url"),
  languages_spoken: text("languages_spoken").array().notNull(),
  areas_exploring: text("areas_exploring").array().notNull(),
  created_at: timestamp("created_at", { mode: "string" }).notNull(),
});

export const bookings = pgTable("bookings", {
  id: varchar("id").primaryKey(),
  mentor_id: varchar("mentor_id").notNull().references(() => mentors.id),
  mentee_id: varchar("mentee_id").notNull().references(() => mentees.id),
  calendly_event_uri: text("calendly_event_uri"),
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

export const mentorsRelations = relations(mentors, ({ many }) => ({
  bookings: many(bookings),
}));

export const menteesRelations = relations(mentees, ({ many }) => ({
  bookings: many(bookings),
}));

export const bookingsRelations = relations(bookings, ({ one }) => ({
  mentor: one(mentors, {
    fields: [bookings.mentor_id],
    references: [mentors.id],
  }),
  mentee: one(mentees, {
    fields: [bookings.mentee_id],
    references: [mentees.id],
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

export type InsertMentor = z.infer<typeof insertMentorSchema>;
export type Mentor = typeof mentors.$inferSelect;
export type InsertMentee = z.infer<typeof insertMenteeSchema>;
export type Mentee = typeof mentees.$inferSelect;
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookings.$inferSelect;
