import { type Mentor, type InsertMentor, type Session, type InsertSession, type Mentee, type InsertMentee, type Favorite, type InsertFavorite, mentors, sessions, mentees, favorites } from "@shared/schema";
import { db } from "./db";
import { eq, ilike, or, and, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  getMentors(filters?: { search?: string; expertise?: string }): Promise<Mentor[]>;
  getMentor(id: string): Promise<Mentor | undefined>;
  createMentor(mentor: InsertMentor): Promise<Mentor>;
  getSessions(): Promise<Session[]>;
  createSession(session: InsertSession): Promise<Session>;
  getMenteeByEmail(email: string): Promise<Mentee | undefined>;
  createMentee(mentee: InsertMentee): Promise<Mentee>;
  getMenteeSessions(email: string): Promise<Session[]>;
  addFavorite(menteeEmail: string, mentorId: string): Promise<Favorite>;
  removeFavorite(menteeEmail: string, mentorId: string): Promise<void>;
  getFavorites(menteeEmail: string): Promise<Favorite[]>;
}

export class DatabaseStorage implements IStorage {
  private seedPromise: Promise<void>;

  constructor() {
    this.seedPromise = this.seedDatabase();
  }

  private async seedDatabase() {
    try {
      const existingMentors = await db.select().from(mentors);
      
      if (existingMentors.length === 0) {
      const seedData: InsertMentor[] = [
        {
          name: "Sarah Chen",
          title: "Senior Product Manager at Google",
          bio: "10+ years building products that millions love. Passionate about helping aspiring PMs break into tech and level up their product thinking.",
          expertise: ["Product Management", "Product Strategy", "User Research", "Roadmapping", "Stakeholder Management"],
          calendlyUrl: "https://calendly.com/sarahchen",
          avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah",
        },
        {
          name: "Marcus Rodriguez",
          title: "Engineering Lead at Stripe",
          bio: "Building scalable systems and leading high-performing engineering teams. I mentor engineers on technical growth, system design, and career advancement.",
          expertise: ["System Design", "Leadership", "Backend Engineering", "Distributed Systems", "Team Building"],
          calendlyUrl: "https://calendly.com/marcusrodriguez",
          avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Marcus",
        },
        {
          name: "Aisha Patel",
          title: "UX Design Director at Airbnb",
          bio: "Creating delightful user experiences for global audiences. I help designers develop their craft, build portfolios, and navigate design careers.",
          expertise: ["UX Design", "Design Systems", "User Research", "Interaction Design", "Design Leadership"],
          calendlyUrl: "https://calendly.com/aishapatel",
          avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Aisha",
        },
        {
          name: "James Kim",
          title: "VP of Marketing at Notion",
          bio: "Growth marketing expert with experience scaling startups from 0 to millions of users. Let's talk growth strategies, content, and brand building.",
          expertise: ["Growth Marketing", "Content Strategy", "Brand Building", "SEO", "Analytics"],
          calendlyUrl: "https://calendly.com/jameskim",
          avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=James",
        },
        {
          name: "Elena Volkov",
          title: "Data Science Manager at Netflix",
          bio: "Turning data into actionable insights. I mentor data professionals on machine learning, analytics, and building data-driven products.",
          expertise: ["Machine Learning", "Data Science", "Analytics", "Python", "AI/ML Strategy"],
          calendlyUrl: "https://calendly.com/elenavolkov",
          avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Elena",
        },
        {
          name: "David Thompson",
          title: "Startup Founder & CEO",
          bio: "Serial entrepreneur with 2 successful exits. I help founders navigate the startup journey, fundraising, and building winning teams.",
          expertise: ["Entrepreneurship", "Fundraising", "Business Strategy", "Sales", "Leadership"],
          calendlyUrl: "https://calendly.com/davidthompson",
          avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=David",
        },
      ];

        for (const data of seedData) {
          const id = randomUUID();
          await db.insert(mentors).values({
            ...data,
            id,
          });
        }
      }
    } catch (error) {
      console.error("Error seeding database:", error);
    }
  }

  async getMentors(filters?: { search?: string; expertise?: string }): Promise<Mentor[]> {
    await this.seedPromise;
    
    if (!filters || (!filters.search && !filters.expertise)) {
      return await db.select().from(mentors);
    }

    const conditions = [];

    if (filters.search) {
      const searchPattern = `%${filters.search}%`;
      conditions.push(
        or(
          ilike(mentors.name, searchPattern),
          ilike(mentors.title, searchPattern),
          ilike(mentors.bio, searchPattern)
        )
      );
    }

    if (filters.expertise) {
      conditions.push(
        sql`${mentors.expertise} @> ARRAY[${filters.expertise}]::text[]`
      );
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];
    
    return await db.select().from(mentors).where(whereClause);
  }

  async getMentor(id: string): Promise<Mentor | undefined> {
    await this.seedPromise;
    const result = await db.select().from(mentors).where(eq(mentors.id, id));
    return result[0];
  }

  async createMentor(insertMentor: InsertMentor): Promise<Mentor> {
    await this.seedPromise;
    const id = randomUUID();
    const result = await db.insert(mentors).values({
      ...insertMentor,
      id,
    }).returning();
    return result[0];
  }

  async getSessions(): Promise<Session[]> {
    await this.seedPromise;
    return await db.select().from(sessions);
  }

  async createSession(insertSession: InsertSession): Promise<Session> {
    await this.seedPromise;
    
    const existingMentee = await this.getMenteeByEmail(insertSession.menteeEmail);
    if (!existingMentee) {
      await this.createMentee({
        name: insertSession.menteeName,
        email: insertSession.menteeEmail,
      });
    }
    
    const id = randomUUID();
    const result = await db.insert(sessions).values({
      ...insertSession,
      id,
      bookedAt: new Date().toISOString(),
    }).returning();
    return result[0];
  }

  async getMenteeByEmail(email: string): Promise<Mentee | undefined> {
    await this.seedPromise;
    const result = await db.select().from(mentees).where(eq(mentees.email, email));
    return result[0];
  }

  async createMentee(insertMentee: InsertMentee): Promise<Mentee> {
    await this.seedPromise;
    const id = randomUUID();
    const result = await db.insert(mentees).values({
      ...insertMentee,
      id,
      createdAt: new Date().toISOString(),
    }).returning();
    return result[0];
  }

  async getMenteeSessions(email: string): Promise<Session[]> {
    await this.seedPromise;
    return await db.select().from(sessions).where(eq(sessions.menteeEmail, email));
  }

  async addFavorite(menteeEmail: string, mentorId: string): Promise<Favorite> {
    await this.seedPromise;
    const id = randomUUID();
    const result = await db.insert(favorites).values({
      id,
      menteeEmail,
      mentorId,
      createdAt: new Date().toISOString(),
    }).returning();
    return result[0];
  }

  async removeFavorite(menteeEmail: string, mentorId: string): Promise<void> {
    await this.seedPromise;
    await db.delete(favorites).where(
      and(
        eq(favorites.menteeEmail, menteeEmail),
        eq(favorites.mentorId, mentorId)
      )
    );
  }

  async getFavorites(menteeEmail: string): Promise<Favorite[]> {
    await this.seedPromise;
    return await db.select().from(favorites).where(eq(favorites.menteeEmail, menteeEmail));
  }
}

export const storage = new DatabaseStorage();
