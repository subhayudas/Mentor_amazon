import { type Mentor, type InsertMentor, type Booking, type InsertBooking, type Mentee, type InsertMentee, mentors, bookings, mentees } from "@shared/schema";
import { db } from "./db";
import { eq, ilike, or, and, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  getMentors(filters?: { search?: string; expertise?: string; industry?: string; language?: string }): Promise<Mentor[]>;
  getMentor(id: string): Promise<Mentor | undefined>;
  createMentor(mentor: InsertMentor): Promise<Mentor>;
  getBookings(): Promise<Booking[]>;
  createBooking(booking: InsertBooking): Promise<Booking>;
  getMentees(): Promise<Mentee[]>;
  getMenteeByEmail(email: string): Promise<Mentee | undefined>;
  createMentee(mentee: InsertMentee): Promise<Mentee>;
  getMenteeBookings(menteeId: string): Promise<Booking[]>;
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
            name: "Ahmed Hassan",
            email: "ahmed.hassan@amazon.com",
            company: "Amazon",
            position: "Senior Product Manager",
            timezone: "Africa/Cairo",
            photo_url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop&crop=faces",
            bio: "Leading product development for Amazon's Middle East marketplace. 8+ years of experience in e-commerce and digital transformation. Passionate about mentoring aspiring product managers in the MENA region.",
            linkedin_url: "https://linkedin.com/in/ahmedhassan",
            calendly_link: "https://calendly.com/ahmedhassan",
            expertise: ["Product Management", "E-commerce", "Digital Transformation", "Agile Methodologies", "Market Strategy"],
            industries: ["E-commerce", "Technology", "Retail"],
            languages_spoken: ["English", "Arabic"],
            comms_owner: "exec",
          },
          {
            name: "Layla Mahmoud",
            email: "layla.mahmoud@amazon.com",
            company: "Amazon",
            position: "Engineering Manager, AWS",
            timezone: "Asia/Dubai",
            photo_url: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&h=400&fit=crop&crop=faces",
            bio: "Building scalable cloud infrastructure for AWS customers across EMEA. 10+ years in distributed systems and team leadership. I mentor engineers on career growth, system design, and technical excellence.",
            linkedin_url: "https://linkedin.com/in/laylamahmoud",
            calendly_link: "https://calendly.com/laylamahmoud",
            expertise: ["Cloud Computing", "System Design", "Engineering Leadership", "AWS Services", "DevOps"],
            industries: ["Cloud Computing", "Technology", "Infrastructure"],
            languages_spoken: ["English", "Arabic", "French"],
            comms_owner: "exec",
          },
          {
            name: "Omar Khalil",
            email: "omar.khalil@amazon.com",
            company: "Amazon",
            position: "Senior UX Designer",
            timezone: "Africa/Cairo",
            photo_url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop&crop=faces",
            bio: "Crafting localized shopping experiences for Middle East customers. Specializing in Arabic UX, accessibility, and cross-cultural design. Happy to help designers navigate the unique challenges of regional markets.",
            linkedin_url: "https://linkedin.com/in/omarkhalil",
            calendly_link: "https://calendly.com/omarkhalil",
            expertise: ["UX Design", "Localization", "Design Systems", "User Research", "Accessibility"],
            industries: ["E-commerce", "Technology", "Design"],
            languages_spoken: ["English", "Arabic"],
            comms_owner: "assistant",
          },
          {
            name: "Fatima Al-Rashid",
            email: "fatima.alrashid@amazon.com",
            company: "Amazon",
            position: "Director of Marketing",
            timezone: "Asia/Riyadh",
            photo_url: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&h=400&fit=crop&crop=faces",
            bio: "Driving brand growth and customer acquisition across the GCC region. Expert in digital marketing, brand strategy, and performance marketing. I mentor marketers on regional market dynamics and growth strategies.",
            linkedin_url: "https://linkedin.com/in/fatimaalrashid",
            calendly_link: "https://calendly.com/fatimaalrashid",
            expertise: ["Digital Marketing", "Brand Strategy", "Growth Marketing", "Performance Marketing", "Regional Markets"],
            industries: ["E-commerce", "Marketing", "Retail"],
            languages_spoken: ["English", "Arabic"],
            comms_owner: "assistant",
          },
          {
            name: "Karim Nasser",
            email: "karim.nasser@amazon.com",
            company: "Amazon",
            position: "Data Science Lead",
            timezone: "Africa/Cairo",
            photo_url: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&h=400&fit=crop&crop=faces",
            bio: "Building recommendation systems and predictive models for Amazon's Middle East operations. 12+ years in machine learning and analytics. I help data professionals develop ML skills and advance their careers.",
            linkedin_url: "https://linkedin.com/in/karimnasser",
            calendly_link: "https://calendly.com/karimnasser",
            expertise: ["Machine Learning", "Data Science", "Predictive Analytics", "Recommendation Systems", "Python"],
            industries: ["Technology", "E-commerce", "Data Analytics"],
            languages_spoken: ["English", "Arabic"],
            comms_owner: "exec",
          },
          {
            name: "Nour Ibrahim",
            email: "nour.ibrahim@amazon.com",
            company: "Amazon",
            position: "Operations Manager, Fulfillment",
            timezone: "Asia/Dubai",
            photo_url: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&h=400&fit=crop&crop=faces",
            bio: "Optimizing logistics and supply chain operations across Middle East fulfillment centers. Expert in operational excellence, process improvement, and team management. Mentoring operations professionals on leadership and efficiency.",
            linkedin_url: "https://linkedin.com/in/nouribrahim",
            calendly_link: "https://calendly.com/nouribrahim",
            expertise: ["Operations Management", "Supply Chain", "Logistics", "Process Improvement", "Leadership"],
            industries: ["E-commerce", "Logistics", "Operations"],
            languages_spoken: ["English", "Arabic"],
            comms_owner: "assistant",
          },
          {
            name: "Youssef Fahmy",
            email: "youssef.fahmy@amazon.com",
            company: "Amazon",
            position: "Senior Business Analyst",
            timezone: "Africa/Cairo",
            photo_url: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400&h=400&fit=crop&crop=faces",
            bio: "Transforming data into strategic insights for retail operations. Specialized in business intelligence, SQL, and data visualization. I mentor analysts on technical skills and business acumen.",
            linkedin_url: "https://linkedin.com/in/yousseffahmy",
            calendly_link: "https://calendly.com/yousseffahmy",
            expertise: ["Business Analysis", "Data Analytics", "SQL", "Business Intelligence", "Data Visualization"],
            industries: ["E-commerce", "Retail", "Analytics"],
            languages_spoken: ["English", "Arabic"],
            comms_owner: "exec",
          },
        ];

        const now = new Date().toISOString();
        for (const data of seedData) {
          const id = randomUUID();
          await db.insert(mentors).values({
            ...data,
            id,
            created_at: now,
            updated_at: now,
          });
        }
      }
    } catch (error) {
      console.error("Error seeding database:", error);
    }
  }

  async getMentors(filters?: { search?: string; expertise?: string; industry?: string; language?: string }): Promise<Mentor[]> {
    await this.seedPromise;
    
    if (!filters || (!filters.search && !filters.expertise && !filters.industry && !filters.language)) {
      return await db.select().from(mentors);
    }

    const conditions = [];

    if (filters.search) {
      const searchPattern = `%${filters.search}%`;
      conditions.push(
        or(
          ilike(mentors.name, searchPattern),
          ilike(mentors.position, searchPattern),
          ilike(mentors.company, searchPattern),
          ilike(mentors.bio, searchPattern)
        )
      );
    }

    if (filters.expertise) {
      conditions.push(
        sql`${mentors.expertise} @> ARRAY[${filters.expertise}]::text[]`
      );
    }

    if (filters.industry) {
      conditions.push(
        sql`${mentors.industries} @> ARRAY[${filters.industry}]::text[]`
      );
    }

    if (filters.language) {
      conditions.push(
        sql`${mentors.languages_spoken} @> ARRAY[${filters.language}]::text[]`
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
    const now = new Date().toISOString();
    const result = await db.insert(mentors).values({
      ...insertMentor,
      id,
      created_at: now,
      updated_at: now,
    }).returning();
    return result[0];
  }

  async getBookings(): Promise<Booking[]> {
    await this.seedPromise;
    return await db.select().from(bookings);
  }

  async createBooking(insertBooking: InsertBooking): Promise<Booking> {
    await this.seedPromise;
    const id = randomUUID();
    const now = new Date().toISOString();
    const result = await db.insert(bookings).values({
      ...insertBooking,
      id,
      clicked_at: now,
      created_at: now,
    }).returning();
    return result[0];
  }

  async getMentees(): Promise<Mentee[]> {
    await this.seedPromise;
    return await db.select().from(mentees);
  }

  async getMenteeByEmail(email: string): Promise<Mentee | undefined> {
    await this.seedPromise;
    const result = await db.select().from(mentees).where(eq(mentees.email, email));
    return result[0];
  }

  async createMentee(insertMentee: InsertMentee): Promise<Mentee> {
    await this.seedPromise;
    const id = randomUUID();
    const now = new Date().toISOString();
    const result = await db.insert(mentees).values({
      ...insertMentee,
      id,
      created_at: now,
    }).returning();
    return result[0];
  }

  async getMenteeBookings(menteeId: string): Promise<Booking[]> {
    await this.seedPromise;
    return await db.select().from(bookings).where(eq(bookings.mentee_id, menteeId));
  }
}

export const storage = new DatabaseStorage();
