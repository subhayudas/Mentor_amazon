import { pgTable, text, varchar, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const mentors = pgTable("mentors", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  title: text("title").notNull(),
  bio: text("bio").notNull(),
  expertise: text("expertise").array().notNull(),
  calendlyUrl: text("calendly_url").notNull(),
  avatarUrl: text("avatar_url"),
});

export const sessions = pgTable("sessions", {
  id: varchar("id").primaryKey(),
  mentorId: varchar("mentor_id").notNull(),
  menteeName: text("mentee_name").notNull(),
  menteeEmail: text("mentee_email").notNull(),
  bookedAt: timestamp("booked_at", { mode: "string" }).notNull(),
});

export const insertMentorSchema = createInsertSchema(mentors).omit({
  id: true,
});

export const insertSessionSchema = createInsertSchema(sessions).omit({
  id: true,
  bookedAt: true,
});

export type InsertMentor = z.infer<typeof insertMentorSchema>;
export type Mentor = typeof mentors.$inferSelect;
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessions.$inferSelect;
