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
            cal_link: "vats-s.-shah-2krirj/mentoring",
            cal_15min: "vats-s.-shah-2krirj/mentoring",
            cal_30min: "vats-s.-shah-2krirj/mentoring",
            cal_60min: "vats-s.-shah-2krirj/mentoring",
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
