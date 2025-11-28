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
            name: "Vats Shah",
            email: "vats.shah@amazon.com",
            company: "Amazon",
            position: "Senior Product Manager",
            timezone: "Asia/Dubai",
            country: "United Arab Emirates",
            photo_url: "/attached_assets/image_1763386758212.png",
            bio: "Leading product development for Amazon's Middle East marketplace. 8+ years of experience in e-commerce and digital transformation. Passionate about mentoring aspiring product managers in the MENA region.",
            linkedin_url: "https://linkedin.com/in/vatsshah",
            calendly_link: "https://calendly.com/vats-verosek",
            calendly_15min: "https://calendly.com/vats-verosek",
            calendly_30min: "https://calendly.com/vats-verosek",
            calendly_60min: "https://calendly.com/vats-verosek",
            expertise: ["Product Management", "E-commerce", "Digital Transformation", "Agile Methodologies", "Market Strategy"],
            industries: ["E-commerce", "Technology", "Retail"],
            languages_spoken: ["English", "Hindi"],
            comms_owner: "exec",
            mentorship_preference: "rotating",
          },
          {
            name: "Layla Mahmoud",
            email: "layla.mahmoud@amazon.com",
            company: "Amazon",
            position: "Engineering Manager, AWS",
            timezone: "Asia/Dubai",
            country: "United Arab Emirates",
            photo_url: "/attached_assets/image_1763386693493.png",
            bio: "Building scalable cloud infrastructure for AWS customers across EMEA. 10+ years in distributed systems and team leadership. I mentor engineers on career growth, system design, and technical excellence.",
            linkedin_url: "https://linkedin.com/in/laylamahmoud",
            calendly_link: "https://calendly.com/laylamahmoud/30min",
            calendly_15min: "https://calendly.com/laylamahmoud/15min",
            calendly_30min: "https://calendly.com/laylamahmoud/30min",
            calendly_60min: "https://calendly.com/laylamahmoud/60min",
            expertise: ["Cloud Computing", "System Design", "Engineering Leadership", "AWS Services", "DevOps"],
            industries: ["Cloud Computing", "Technology", "Infrastructure"],
            languages_spoken: ["English", "Arabic", "French"],
            comms_owner: "exec",
            mentorship_preference: "ongoing",
          },
          {
            name: "Omar Khalil",
            email: "omar.khalil@amazon.com",
            company: "Amazon",
            position: "Senior UX Designer",
            timezone: "Africa/Cairo",
            country: "Egypt",
            photo_url: "/attached_assets/image_1763386720221.png",
            bio: "Crafting localized shopping experiences for Middle East customers. Specializing in Arabic UX, accessibility, and cross-cultural design. Happy to help designers navigate the unique challenges of regional markets.",
            linkedin_url: "https://linkedin.com/in/omarkhalil",
            calendly_link: "https://calendly.com/omarkhalil/30min",
            calendly_15min: "https://calendly.com/omarkhalil/15min",
            calendly_30min: "https://calendly.com/omarkhalil/30min",
            calendly_60min: "https://calendly.com/omarkhalil/60min",
            expertise: ["UX Design", "Localization", "Design Systems", "User Research", "Accessibility"],
            industries: ["E-commerce", "Technology", "Design"],
            languages_spoken: ["English", "Arabic"],
            comms_owner: "assistant",
            mentorship_preference: "rotating",
          },
          {
            name: "Levi Lewandowski",
            email: "levi.lewandowski@amazon.com",
            company: "Amazon",
            position: "Strategic Partnerships Lead",
            timezone: "America/New_York",
            country: "United States",
            photo_url: "/attached_assets/image_1763387494054.png",
            bio: "Building strategic partnerships and accelerating growth initiatives for Amazon's innovation programs. Expert in startup ecosystems, venture partnerships, and business development. I mentor entrepreneurs and partnership professionals on scaling strategies.",
            linkedin_url: "https://linkedin.com/in/levilewandowski",
            calendly_link: "https://calendly.com/levi-lewandowski-brinc/meet",
            calendly_15min: "https://calendly.com/levi-lewandowski-brinc/meet",
            calendly_30min: "https://calendly.com/levi-lewandowski-brinc/meet",
            calendly_60min: "https://calendly.com/levi-lewandowski-brinc/meet",
            expertise: ["Strategic Partnerships", "Business Development", "Startup Ecosystems", "Innovation Programs", "Venture Relations"],
            industries: ["Technology", "Startups", "Innovation"],
            languages_spoken: ["English"],
            comms_owner: "exec",
            mentorship_preference: "rotating",
          },
          {
            name: "Karim Nasser",
            email: "karim.nasser@amazon.com",
            company: "Amazon",
            position: "Data Science Lead",
            timezone: "Africa/Cairo",
            country: "Egypt",
            photo_url: "/attached_assets/image_1763386661657.png",
            bio: "Building recommendation systems and predictive models for Amazon's Middle East operations. 12+ years in machine learning and analytics. I help data professionals develop ML skills and advance their careers.",
            linkedin_url: "https://linkedin.com/in/karimnasser",
            calendly_link: "https://calendly.com/karimnasser/30min",
            calendly_15min: "https://calendly.com/karimnasser/15min",
            calendly_30min: "https://calendly.com/karimnasser/30min",
            calendly_60min: "https://calendly.com/karimnasser/60min",
            expertise: ["Machine Learning", "Data Science", "Predictive Analytics", "Recommendation Systems", "Python"],
            industries: ["Technology", "E-commerce", "Data Analytics"],
            languages_spoken: ["English", "Arabic"],
            comms_owner: "exec",
            mentorship_preference: "ongoing",
          },
          {
            name: "Nour Ibrahim",
            email: "nour.ibrahim@amazon.com",
            company: "Amazon",
            position: "Operations Manager, Fulfillment",
            timezone: "Asia/Dubai",
            country: "United Arab Emirates",
            photo_url: "/attached_assets/image_1763386772495.png",
            bio: "Optimizing logistics and supply chain operations across Middle East fulfillment centers. Expert in operational excellence, process improvement, and team management. Mentoring operations professionals on leadership and efficiency.",
            linkedin_url: "https://linkedin.com/in/nouribrahim",
            calendly_link: "https://calendly.com/nouribrahim/30min",
            calendly_15min: "https://calendly.com/nouribrahim/15min",
            calendly_30min: "https://calendly.com/nouribrahim/30min",
            calendly_60min: "https://calendly.com/nouribrahim/60min",
            expertise: ["Operations Management", "Supply Chain", "Logistics", "Process Improvement", "Leadership"],
            industries: ["E-commerce", "Logistics", "Operations"],
            languages_spoken: ["English", "Arabic"],
            comms_owner: "assistant",
            mentorship_preference: "rotating",
          },
          {
            name: "Youssef Fahmy",
            email: "youssef.fahmy@amazon.com",
            company: "Amazon",
            position: "Senior Business Analyst",
            timezone: "Africa/Cairo",
            country: "Egypt",
            photo_url: "/attached_assets/image_1763386732789.png",
            bio: "Transforming data into strategic insights for retail operations. Specialized in business intelligence, SQL, and data visualization. I mentor analysts on technical skills and business acumen.",
            linkedin_url: "https://linkedin.com/in/yousseffahmy",
            calendly_link: "https://calendly.com/yousseffahmy/30min",
            calendly_15min: "https://calendly.com/yousseffahmy/15min",
            calendly_30min: "https://calendly.com/yousseffahmy/30min",
            calendly_60min: "https://calendly.com/yousseffahmy/60min",
            expertise: ["Business Analysis", "Data Analytics", "SQL", "Business Intelligence", "Data Visualization"],
            industries: ["E-commerce", "Retail", "Analytics"],
            languages_spoken: ["English", "Arabic"],
            comms_owner: "exec",
            mentorship_preference: "ongoing",
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
