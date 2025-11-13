import { type Mentor, type InsertMentor, type Session, type InsertSession } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getMentors(): Promise<Mentor[]>;
  getMentor(id: string): Promise<Mentor | undefined>;
  createMentor(mentor: InsertMentor): Promise<Mentor>;
  getSessions(): Promise<Session[]>;
  createSession(session: InsertSession): Promise<Session>;
}

export class MemStorage implements IStorage {
  private mentors: Map<string, Mentor>;
  private sessions: Map<string, Session>;

  constructor() {
    this.mentors = new Map();
    this.sessions = new Map();
    this.seedMentors();
  }

  private seedMentors() {
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

    seedData.forEach((data) => {
      const id = randomUUID();
      const mentor: Mentor = { ...data, id };
      this.mentors.set(id, mentor);
    });
  }

  async getMentors(): Promise<Mentor[]> {
    return Array.from(this.mentors.values());
  }

  async getMentor(id: string): Promise<Mentor | undefined> {
    return this.mentors.get(id);
  }

  async createMentor(insertMentor: InsertMentor): Promise<Mentor> {
    const id = randomUUID();
    const mentor: Mentor = { ...insertMentor, id };
    this.mentors.set(id, mentor);
    return mentor;
  }

  async getSessions(): Promise<Session[]> {
    return Array.from(this.sessions.values());
  }

  async createSession(insertSession: InsertSession): Promise<Session> {
    const id = randomUUID();
    const session: Session = {
      ...insertSession,
      id,
      bookedAt: new Date().toISOString(),
    };
    this.sessions.set(id, session);
    return session;
  }
}

export const storage = new MemStorage();
