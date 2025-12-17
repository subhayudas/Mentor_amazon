import { type Mentor, type InsertMentor, type Booking, type InsertBooking, type Mentee, type InsertMentee, type BookingNote, type InsertBookingNote, type Notification, type InsertNotification, type User, type InsertUser, type MentorAvailability, type InsertMentorAvailability, type MentorTask, type InsertMentorTask, type MentorEarnings, type InsertMentorEarnings, type MentorActivityLog, type InsertMentorActivityLog, mentors, bookings, mentees, bookingNotes, notifications, users, mentorAvailability, mentorTasks, mentorEarnings, mentorActivityLog } from "@shared/schema";
import { db } from "./db";
import { eq, ilike, or, and, sql, desc, sum } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface MentorDashboardStats {
  totalSessions: number;
  completedSessions: number;
  averageRating: number;
  totalEarnings: number;
  monthlyEarnings: number;
  pendingBookings: number;
}

export interface IStorage {
  getMentors(filters?: { search?: string; expertise?: string; industry?: string; language?: string }): Promise<Mentor[]>;
  getMentor(id: string): Promise<Mentor | undefined>;
  getMentorByEmail(email: string): Promise<Mentor | undefined>;
  createMentor(mentor: InsertMentor): Promise<Mentor>;
  updateMentorAvailability(id: string, isAvailable: boolean): Promise<Mentor | undefined>;
  updateMentor(id: string, updates: Partial<InsertMentor>): Promise<Mentor | undefined>;
  getBookings(): Promise<Booking[]>;
  getBooking(id: string): Promise<Booking | undefined>;
  createBooking(booking: InsertBooking): Promise<Booking>;
  getMentorBookings(mentorId: string): Promise<Booking[]>;
  getMentees(): Promise<Mentee[]>;
  getMentee(id: string): Promise<Mentee | undefined>;
  getMenteeByEmail(email: string): Promise<Mentee | undefined>;
  getMenteeById(id: string): Promise<Mentee | undefined>;
  createMentee(mentee: InsertMentee): Promise<Mentee>;
  updateMentee(id: string, updates: Partial<InsertMentee>): Promise<Mentee | undefined>;
  getBookingNotes(bookingId: string): Promise<BookingNote[]>;
  createBookingNote(note: InsertBookingNote): Promise<BookingNote>;
  updateBookingNote(id: string, updates: Partial<InsertBookingNote>): Promise<BookingNote | undefined>;
  deleteBookingNote(id: string): Promise<boolean>;
  getNotifications(email: string): Promise<Notification[]>;
  getUnreadNotificationCount(email: string): Promise<number>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationAsRead(id: string): Promise<Notification | undefined>;
  markAllNotificationsAsRead(email: string): Promise<void>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserById(id: string): Promise<User | undefined>;
  getUserByResetToken(token: string): Promise<User | undefined>;
  createUser(user: InsertUser & { password: string }): Promise<User>;
  updateUserResetToken(id: string, token: string | null, expires: string | null): Promise<void>;
  updateUserPassword(id: string, hashedPassword: string): Promise<void>;
  verifyUser(id: string): Promise<void>;
  
  // Mentor Dashboard methods
  getMentorDashboardStats(mentorId: string): Promise<MentorDashboardStats>;
  getMentorBookingsWithStatus(mentorId: string, status?: string): Promise<Booking[]>;
  updateBookingStatus(bookingId: string, status: string): Promise<Booking | undefined>;
  getMentorTasks(mentorId: string): Promise<MentorTask[]>;
  createMentorTask(task: InsertMentorTask): Promise<MentorTask>;
  updateMentorTask(taskId: string, updates: Partial<MentorTask>): Promise<MentorTask | undefined>;
  getMentorAvailabilitySlots(mentorId: string): Promise<MentorAvailability[]>;
  setMentorAvailability(mentorId: string, slots: InsertMentorAvailability[]): Promise<MentorAvailability[]>;
  getMentorEarnings(mentorId: string): Promise<MentorEarnings[]>;
  getMentorActivityLog(mentorId: string, limit?: number): Promise<MentorActivityLog[]>;
  createActivityLog(log: InsertMentorActivityLog): Promise<MentorActivityLog>;
  
  // Feedback methods
  submitMenteeFeedback(bookingId: string, rating: number, feedback: string): Promise<Booking | undefined>;
  submitMentorFeedback(bookingId: string, rating: number, feedback: string): Promise<Booking | undefined>;
  updateMentorRating(mentorId: string): Promise<void>;
  getMentorFeedback(mentorId: string): Promise<(Booking & { mentee?: Mentee })[]>;
  getMenteeFeedback(menteeId: string): Promise<(Booking & { mentor?: Mentor })[]>;
  getMenteeBookings(menteeId: string, status?: string): Promise<(Booking & { mentor?: Mentor })[]>;
  getMenteeStats(menteeId: string): Promise<{ totalSessions: number; completedSessions: number; upcomingSessions: number; uniqueMentors: number }>;
  
  // Booking request methods
  createBookingRequest(mentorId: string, menteeId: string, goal: string): Promise<Booking>;
  acceptBooking(bookingId: string): Promise<Booking | undefined>;
  declineBooking(bookingId: string): Promise<Booking | undefined>;
  getPendingBookingsForMentor(mentorId: string): Promise<(Booking & { mentee?: Mentee })[]>;
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
            comms_owner: "exec",
            mentorship_preference: "rotating",
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
            comms_owner: "exec",
            mentorship_preference: "ongoing",
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
            comms_owner: "assistant",
            mentorship_preference: "rotating",
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
            comms_owner: "exec",
            mentorship_preference: "rotating",
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
            comms_owner: "exec",
            mentorship_preference: "ongoing",
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
            comms_owner: "assistant",
            mentorship_preference: "rotating",
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

  async getMentorByEmail(email: string): Promise<Mentor | undefined> {
    await this.seedPromise;
    const result = await db.select().from(mentors).where(eq(mentors.email, email));
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

  async getMenteeById(id: string): Promise<Mentee | undefined> {
    await this.seedPromise;
    const result = await db.select().from(mentees).where(eq(mentees.id, id));
    return result[0];
  }

  async getMentee(id: string): Promise<Mentee | undefined> {
    return this.getMenteeById(id);
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

  async getMentorBookings(mentorId: string): Promise<Booking[]> {
    await this.seedPromise;
    return await db.select().from(bookings).where(eq(bookings.mentor_id, mentorId));
  }

  async updateMentorAvailability(id: string, isAvailable: boolean): Promise<Mentor | undefined> {
    await this.seedPromise;
    const now = new Date().toISOString();
    const result = await db.update(mentors)
      .set({ is_available: isAvailable, updated_at: now })
      .where(eq(mentors.id, id))
      .returning();
    return result[0];
  }

  async updateMentor(id: string, updates: Partial<InsertMentor>): Promise<Mentor | undefined> {
    await this.seedPromise;
    const now = new Date().toISOString();
    const result = await db.update(mentors)
      .set({ ...updates, updated_at: now })
      .where(eq(mentors.id, id))
      .returning();
    return result[0];
  }

  async getBooking(id: string): Promise<Booking | undefined> {
    await this.seedPromise;
    const result = await db.select().from(bookings).where(eq(bookings.id, id));
    return result[0];
  }

  async updateMentee(id: string, updates: Partial<InsertMentee>): Promise<Mentee | undefined> {
    await this.seedPromise;
    const result = await db.update(mentees)
      .set(updates)
      .where(eq(mentees.id, id))
      .returning();
    return result[0];
  }

  async getBookingNotes(bookingId: string): Promise<BookingNote[]> {
    await this.seedPromise;
    return await db.select().from(bookingNotes).where(eq(bookingNotes.booking_id, bookingId));
  }

  async createBookingNote(insertNote: InsertBookingNote): Promise<BookingNote> {
    await this.seedPromise;
    const id = randomUUID();
    const now = new Date().toISOString();
    const result = await db.insert(bookingNotes).values({
      ...insertNote,
      id,
      created_at: now,
    }).returning();
    return result[0];
  }

  async updateBookingNote(id: string, updates: Partial<InsertBookingNote>): Promise<BookingNote | undefined> {
    await this.seedPromise;
    const result = await db.update(bookingNotes)
      .set(updates)
      .where(eq(bookingNotes.id, id))
      .returning();
    return result[0];
  }

  async deleteBookingNote(id: string): Promise<boolean> {
    await this.seedPromise;
    const result = await db.delete(bookingNotes).where(eq(bookingNotes.id, id)).returning();
    return result.length > 0;
  }

  async getNotifications(email: string): Promise<Notification[]> {
    await this.seedPromise;
    return await db.select().from(notifications)
      .where(eq(notifications.recipient_email, email))
      .orderBy(desc(notifications.created_at));
  }

  async getUnreadNotificationCount(email: string): Promise<number> {
    await this.seedPromise;
    const result = await db.select().from(notifications)
      .where(and(
        eq(notifications.recipient_email, email),
        eq(notifications.is_read, false)
      ));
    return result.length;
  }

  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    await this.seedPromise;
    const id = randomUUID();
    const now = new Date().toISOString();
    const result = await db.insert(notifications).values({
      ...insertNotification,
      id,
      created_at: now,
    }).returning();
    return result[0];
  }

  async markNotificationAsRead(id: string): Promise<Notification | undefined> {
    await this.seedPromise;
    const result = await db.update(notifications)
      .set({ is_read: true })
      .where(eq(notifications.id, id))
      .returning();
    return result[0];
  }

  async markAllNotificationsAsRead(email: string): Promise<void> {
    await this.seedPromise;
    await db.update(notifications)
      .set({ is_read: true })
      .where(eq(notifications.recipient_email, email));
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    await this.seedPromise;
    const result = await db.select().from(users).where(eq(users.email, email));
    return result[0];
  }

  async getUserById(id: string): Promise<User | undefined> {
    await this.seedPromise;
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async getUserByResetToken(token: string): Promise<User | undefined> {
    await this.seedPromise;
    const result = await db.select().from(users).where(eq(users.reset_token, token));
    return result[0];
  }

  async createUser(userData: InsertUser & { password: string }): Promise<User> {
    await this.seedPromise;
    const id = randomUUID();
    const now = new Date().toISOString();
    const result = await db.insert(users).values({
      ...userData,
      id,
      created_at: now,
    }).returning();
    return result[0];
  }

  async updateUserResetToken(id: string, token: string | null, expires: string | null): Promise<void> {
    await this.seedPromise;
    await db.update(users)
      .set({ reset_token: token, reset_token_expires: expires })
      .where(eq(users.id, id));
  }

  async updateUserPassword(id: string, hashedPassword: string): Promise<void> {
    await this.seedPromise;
    await db.update(users)
      .set({ password: hashedPassword, reset_token: null, reset_token_expires: null })
      .where(eq(users.id, id));
  }

  async verifyUser(id: string): Promise<void> {
    await this.seedPromise;
    await db.update(users)
      .set({ is_verified: true })
      .where(eq(users.id, id));
  }

  // Mentor Dashboard methods
  async getMentorDashboardStats(mentorId: string): Promise<MentorDashboardStats> {
    await this.seedPromise;
    
    // Get all bookings for this mentor
    const allBookings = await db.select().from(bookings).where(eq(bookings.mentor_id, mentorId));
    
    const totalSessions = allBookings.length;
    const completedSessions = allBookings.filter(b => b.status === "completed").length;
    const pendingBookings = allBookings.filter(b => b.status === "pending").length;
    
    // Calculate average rating from completed sessions with ratings
    const ratingsData = allBookings.filter(b => b.mentee_rating !== null);
    const averageRating = ratingsData.length > 0 
      ? ratingsData.reduce((sum, b) => sum + (b.mentee_rating || 0), 0) / ratingsData.length 
      : 0;
    
    // Get total earnings
    const earningsResult = await db.select().from(mentorEarnings).where(eq(mentorEarnings.mentor_id, mentorId));
    const totalEarnings = earningsResult.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    
    // Get current month earnings
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
    const monthlyEarningsData = earningsResult.filter(e => e.payout_month === currentMonth);
    const monthlyEarnings = monthlyEarningsData.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    
    return {
      totalSessions,
      completedSessions,
      averageRating: Math.round(averageRating * 100) / 100,
      totalEarnings,
      monthlyEarnings,
      pendingBookings,
    };
  }

  async getMentorBookingsWithStatus(mentorId: string, status?: string): Promise<Booking[]> {
    await this.seedPromise;
    
    if (status) {
      return await db.select().from(bookings)
        .where(and(
          eq(bookings.mentor_id, mentorId),
          eq(bookings.status, status as "pending" | "accepted" | "rejected" | "confirmed" | "completed" | "canceled")
        ))
        .orderBy(desc(bookings.created_at));
    }
    
    return await db.select().from(bookings)
      .where(eq(bookings.mentor_id, mentorId))
      .orderBy(desc(bookings.created_at));
  }

  async updateBookingStatus(bookingId: string, status: string): Promise<Booking | undefined> {
    await this.seedPromise;
    const now = new Date().toISOString();
    
    const updateData: Record<string, string> = { status };
    
    if (status === "completed") {
      updateData.completed_at = now;
    } else if (status === "canceled") {
      updateData.canceled_at = now;
    }
    
    const result = await db.update(bookings)
      .set(updateData)
      .where(eq(bookings.id, bookingId))
      .returning();
    return result[0];
  }

  async findAndConfirmAcceptedBooking(
    mentorId: string, 
    menteeEmail: string, 
    calEventUri?: string,
    scheduledAt?: string
  ): Promise<Booking | undefined> {
    await this.seedPromise;
    
    // Find an accepted booking for this mentor and mentee
    const mentee = await this.getMenteeByEmail(menteeEmail);
    if (!mentee) return undefined;
    
    const acceptedBookings = await db.select().from(bookings)
      .where(and(
        eq(bookings.mentor_id, mentorId),
        eq(bookings.mentee_id, mentee.id),
        eq(bookings.status, "accepted")
      ))
      .orderBy(desc(bookings.created_at))
      .limit(1);
    
    if (acceptedBookings.length === 0) return undefined;
    
    const booking = acceptedBookings[0];
    const now = new Date().toISOString();
    
    // Update to confirmed with Cal.com details
    const result = await db.update(bookings)
      .set({
        status: "confirmed",
        cal_event_uri: calEventUri,
        scheduled_at: scheduledAt,
        responded_at: now,
      })
      .where(eq(bookings.id, booking.id))
      .returning();
    
    return result[0];
  }

  async getMentorTasks(mentorId: string): Promise<MentorTask[]> {
    await this.seedPromise;
    return await db.select().from(mentorTasks)
      .where(eq(mentorTasks.mentor_id, mentorId))
      .orderBy(desc(mentorTasks.created_at));
  }

  async createMentorTask(task: InsertMentorTask): Promise<MentorTask> {
    await this.seedPromise;
    const id = randomUUID();
    const now = new Date().toISOString();
    const result = await db.insert(mentorTasks).values({
      ...task,
      id,
      created_at: now,
      updated_at: now,
    }).returning();
    return result[0];
  }

  async updateMentorTask(taskId: string, updates: Partial<MentorTask>): Promise<MentorTask | undefined> {
    await this.seedPromise;
    const now = new Date().toISOString();
    
    const updateData: Partial<MentorTask> = {
      ...updates,
      updated_at: now,
    };
    
    if (updates.status === "completed" && !updates.completed_at) {
      updateData.completed_at = now;
    }
    
    const result = await db.update(mentorTasks)
      .set(updateData)
      .where(eq(mentorTasks.id, taskId))
      .returning();
    return result[0];
  }

  async getMentorAvailabilitySlots(mentorId: string): Promise<MentorAvailability[]> {
    await this.seedPromise;
    return await db.select().from(mentorAvailability)
      .where(eq(mentorAvailability.mentor_id, mentorId))
      .orderBy(mentorAvailability.day_of_week);
  }

  async setMentorAvailability(mentorId: string, slots: InsertMentorAvailability[]): Promise<MentorAvailability[]> {
    await this.seedPromise;
    
    // Delete existing availability for this mentor
    await db.delete(mentorAvailability).where(eq(mentorAvailability.mentor_id, mentorId));
    
    // Insert new slots
    if (slots.length === 0) {
      return [];
    }
    
    const now = new Date().toISOString();
    const slotsWithIds = slots.map(slot => ({
      ...slot,
      id: randomUUID(),
      mentor_id: mentorId,
      created_at: now,
    }));
    
    const result = await db.insert(mentorAvailability).values(slotsWithIds).returning();
    return result;
  }

  async getMentorEarnings(mentorId: string): Promise<MentorEarnings[]> {
    await this.seedPromise;
    return await db.select().from(mentorEarnings)
      .where(eq(mentorEarnings.mentor_id, mentorId))
      .orderBy(desc(mentorEarnings.earned_at));
  }

  async getMentorActivityLog(mentorId: string, limit: number = 50): Promise<MentorActivityLog[]> {
    await this.seedPromise;
    return await db.select().from(mentorActivityLog)
      .where(eq(mentorActivityLog.mentor_id, mentorId))
      .orderBy(desc(mentorActivityLog.created_at))
      .limit(limit);
  }

  async createActivityLog(log: InsertMentorActivityLog): Promise<MentorActivityLog> {
    await this.seedPromise;
    const id = randomUUID();
    const now = new Date().toISOString();
    const result = await db.insert(mentorActivityLog).values({
      ...log,
      id,
      created_at: now,
    }).returning();
    return result[0];
  }

  // Feedback methods
  async submitMenteeFeedback(bookingId: string, rating: number, feedback: string): Promise<Booking | undefined> {
    await this.seedPromise;
    const result = await db.update(bookings)
      .set({ mentee_rating: rating, mentee_feedback: feedback })
      .where(eq(bookings.id, bookingId))
      .returning();
    return result[0];
  }

  async submitMentorFeedback(bookingId: string, rating: number, feedback: string): Promise<Booking | undefined> {
    await this.seedPromise;
    const result = await db.update(bookings)
      .set({ mentor_rating: rating, mentor_feedback: feedback })
      .where(eq(bookings.id, bookingId))
      .returning();
    return result[0];
  }

  async updateMentorRating(mentorId: string): Promise<void> {
    await this.seedPromise;
    // Calculate average rating from all bookings with ratings
    const mentorBookings = await db.select().from(bookings)
      .where(and(
        eq(bookings.mentor_id, mentorId),
        sql`${bookings.mentee_rating} IS NOT NULL`
      ));
    
    if (mentorBookings.length === 0) return;
    
    const totalRating = mentorBookings.reduce((sum, b) => sum + (b.mentee_rating || 0), 0);
    const avgRating = totalRating / mentorBookings.length;
    
    await db.update(mentors)
      .set({ 
        average_rating: avgRating.toFixed(2), 
        total_ratings: mentorBookings.length 
      })
      .where(eq(mentors.id, mentorId));
  }

  async getMentorFeedback(mentorId: string): Promise<(Booking & { mentee?: Mentee })[]> {
    await this.seedPromise;
    const feedbackBookings = await db.select().from(bookings)
      .where(and(
        eq(bookings.mentor_id, mentorId),
        sql`${bookings.mentee_rating} IS NOT NULL`
      ))
      .orderBy(desc(bookings.created_at));
    
    // Get mentee details for each booking
    const result = await Promise.all(feedbackBookings.map(async (booking) => {
      const mentee = await this.getMentee(booking.mentee_id);
      return { ...booking, mentee };
    }));
    
    return result;
  }

  async getMenteeFeedback(menteeId: string): Promise<(Booking & { mentor?: Mentor })[]> {
    await this.seedPromise;
    const feedbackBookings = await db.select().from(bookings)
      .where(and(
        eq(bookings.mentee_id, menteeId),
        sql`${bookings.mentor_rating} IS NOT NULL`
      ))
      .orderBy(desc(bookings.created_at));
    
    // Get mentor details for each booking
    const result = await Promise.all(feedbackBookings.map(async (booking) => {
      const mentor = await this.getMentor(booking.mentor_id);
      return { ...booking, mentor };
    }));
    
    return result;
  }

  async getMenteeBookings(menteeId: string, status?: string): Promise<(Booking & { mentor?: Mentor })[]> {
    await this.seedPromise;
    
    let menteeBookings;
    if (status) {
      menteeBookings = await db.select().from(bookings)
        .where(and(
          eq(bookings.mentee_id, menteeId),
          eq(bookings.status, status as "pending" | "accepted" | "rejected" | "confirmed" | "completed" | "canceled")
        ))
        .orderBy(desc(bookings.created_at));
    } else {
      menteeBookings = await db.select().from(bookings)
        .where(eq(bookings.mentee_id, menteeId))
        .orderBy(desc(bookings.created_at));
    }
    
    // Get mentor details for each booking
    const result = await Promise.all(menteeBookings.map(async (booking) => {
      const mentor = await this.getMentor(booking.mentor_id);
      return { ...booking, mentor };
    }));
    
    return result;
  }

  async getMenteeStats(menteeId: string): Promise<{ totalSessions: number; completedSessions: number; upcomingSessions: number; uniqueMentors: number }> {
    await this.seedPromise;
    
    const menteeBookings = await db.select().from(bookings)
      .where(eq(bookings.mentee_id, menteeId));
    
    const totalSessions = menteeBookings.length;
    const completedSessions = menteeBookings.filter(b => b.status === "completed").length;
    const upcomingSessions = menteeBookings.filter(b => b.status === "confirmed").length;
    const uniqueMentors = new Set(menteeBookings.map(b => b.mentor_id)).size;
    
    return {
      totalSessions,
      completedSessions,
      upcomingSessions,
      uniqueMentors,
    };
  }

  // Booking request methods
  async createBookingRequest(mentorId: string, menteeId: string, goal: string): Promise<Booking> {
    await this.seedPromise;
    const id = randomUUID();
    const now = new Date().toISOString();
    
    const result = await db.insert(bookings).values({
      id,
      mentor_id: mentorId,
      mentee_id: menteeId,
      goal,
      status: "pending",
      created_at: now,
    }).returning();
    
    return result[0];
  }

  async acceptBooking(bookingId: string): Promise<Booking | undefined> {
    await this.seedPromise;
    const now = new Date().toISOString();
    
    const result = await db.update(bookings)
      .set({ 
        status: "accepted",
        responded_at: now,
      })
      .where(eq(bookings.id, bookingId))
      .returning();
    
    return result[0];
  }

  async declineBooking(bookingId: string): Promise<Booking | undefined> {
    await this.seedPromise;
    const now = new Date().toISOString();
    
    const result = await db.update(bookings)
      .set({ 
        status: "rejected",
        responded_at: now,
      })
      .where(eq(bookings.id, bookingId))
      .returning();
    
    return result[0];
  }

  async getPendingBookingsForMentor(mentorId: string): Promise<(Booking & { mentee?: Mentee })[]> {
    await this.seedPromise;
    
    const pendingBookings = await db.select().from(bookings)
      .where(and(
        eq(bookings.mentor_id, mentorId),
        eq(bookings.status, "pending")
      ))
      .orderBy(desc(bookings.created_at));
    
    const result = await Promise.all(pendingBookings.map(async (booking) => {
      const mentee = await this.getMentee(booking.mentee_id);
      return { ...booking, mentee };
    }));
    
    return result;
  }
}

export const storage = new DatabaseStorage();
