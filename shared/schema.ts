import { pgTable, text, varchar, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
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

export const mentees = pgTable("mentees", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { mode: "string" }).notNull(),
});

export const sessions = pgTable("sessions", {
  id: varchar("id").primaryKey(),
  mentorId: varchar("mentor_id").notNull().references(() => mentors.id),
  menteeName: text("mentee_name").notNull(),
  menteeEmail: text("mentee_email").notNull(),
  bookedAt: timestamp("booked_at", { mode: "string" }).notNull(),
});

export const favorites = pgTable("favorites", {
  id: varchar("id").primaryKey(),
  menteeEmail: varchar("mentee_email").notNull(),
  mentorId: varchar("mentor_id").notNull().references(() => mentors.id),
  createdAt: timestamp("created_at", { mode: "string" }).notNull(),
});

export const mentorsRelations = relations(mentors, ({ many }) => ({
  sessions: many(sessions),
  favorites: many(favorites),
}));

export const menteesRelations = relations(mentees, ({ many }) => ({
  sessions: many(sessions, {
    relationName: "mentee_sessions",
  }),
  favorites: many(favorites),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  mentor: one(mentors, {
    fields: [sessions.mentorId],
    references: [mentors.id],
  }),
  mentee: one(mentees, {
    fields: [sessions.menteeEmail],
    references: [mentees.email],
    relationName: "mentee_sessions",
  }),
}));

export const favoritesRelations = relations(favorites, ({ one }) => ({
  mentor: one(mentors, {
    fields: [favorites.mentorId],
    references: [mentors.id],
  }),
  mentee: one(mentees, {
    fields: [favorites.menteeEmail],
    references: [mentees.email],
  }),
}));

export const insertMentorSchema = createInsertSchema(mentors).omit({
  id: true,
});

export const insertMenteeSchema = createInsertSchema(mentees).omit({
  id: true,
  createdAt: true,
});

export const insertSessionSchema = createInsertSchema(sessions).omit({
  id: true,
  bookedAt: true,
});

export const insertFavoriteSchema = createInsertSchema(favorites).omit({
  id: true,
  createdAt: true,
});

export type InsertMentor = z.infer<typeof insertMentorSchema>;
export type Mentor = typeof mentors.$inferSelect;
export type InsertMentee = z.infer<typeof insertMenteeSchema>;
export type Mentee = typeof mentees.$inferSelect;
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessions.$inferSelect;
export type InsertFavorite = z.infer<typeof insertFavoriteSchema>;
export type Favorite = typeof favorites.$inferSelect;
