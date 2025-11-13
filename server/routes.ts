import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertSessionSchema, insertMenteeSchema, insertFavoriteSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/mentors", async (req, res) => {
    try {
      const search = req.query.search as string | undefined;
      const expertise = req.query.expertise as string | undefined;
      
      const filters = {
        search: search || undefined,
        expertise: expertise || undefined,
      };
      
      const mentors = await storage.getMentors(filters);
      res.json(mentors);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch mentors" });
    }
  });

  app.get("/api/mentors/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const mentor = await storage.getMentor(id);
      
      if (!mentor) {
        return res.status(404).json({ message: "Mentor not found" });
      }
      
      res.json(mentor);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch mentor" });
    }
  });

  app.get("/api/sessions", async (_req, res) => {
    try {
      const sessions = await storage.getSessions();
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch sessions" });
    }
  });

  app.post("/api/sessions", async (req, res) => {
    try {
      const result = insertSessionSchema.safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json({ 
          message: "Invalid session data",
          errors: result.error.errors 
        });
      }

      const mentor = await storage.getMentor(result.data.mentorId);
      if (!mentor) {
        return res.status(404).json({ message: "Mentor not found" });
      }

      const session = await storage.createSession(result.data);
      res.status(201).json(session);
    } catch (error) {
      res.status(500).json({ message: "Failed to create session" });
    }
  });

  app.get("/api/mentees/:email", async (req, res) => {
    try {
      const { email } = req.params;
      const mentee = await storage.getMenteeByEmail(email);
      
      if (!mentee) {
        return res.status(404).json({ message: "Mentee not found" });
      }
      
      res.json(mentee);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch mentee" });
    }
  });

  app.post("/api/mentees", async (req, res) => {
    try {
      const result = insertMenteeSchema.safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json({ 
          message: "Invalid mentee data",
          errors: result.error.errors 
        });
      }

      const existingMentee = await storage.getMenteeByEmail(result.data.email);
      if (existingMentee) {
        return res.status(409).json({ message: "Mentee with this email already exists" });
      }

      const mentee = await storage.createMentee(result.data);
      res.status(201).json(mentee);
    } catch (error) {
      res.status(500).json({ message: "Failed to create mentee" });
    }
  });

  app.get("/api/mentees/:email/sessions", async (req, res) => {
    try {
      const { email } = req.params;
      
      const mentee = await storage.getMenteeByEmail(email);
      if (!mentee) {
        return res.status(404).json({ message: "Mentee not found" });
      }

      const sessions = await storage.getMenteeSessions(email);
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch mentee sessions" });
    }
  });

  app.get("/api/mentees/:email/favorites", async (req, res) => {
    try {
      const { email } = req.params;
      
      const mentee = await storage.getMenteeByEmail(email);
      if (!mentee) {
        return res.status(404).json({ message: "Mentee not found" });
      }

      const favorites = await storage.getFavorites(email);
      res.json(favorites);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch favorites" });
    }
  });

  app.post("/api/mentees/:email/favorites", async (req, res) => {
    try {
      const { email } = req.params;
      const bodySchema = z.object({ mentorId: z.string() });
      const bodyResult = bodySchema.safeParse(req.body);
      
      if (!bodyResult.success) {
        return res.status(400).json({ 
          message: "Invalid request body",
          errors: bodyResult.error.errors 
        });
      }

      const mentee = await storage.getMenteeByEmail(email);
      if (!mentee) {
        return res.status(404).json({ message: "Mentee not found" });
      }

      const mentor = await storage.getMentor(bodyResult.data.mentorId);
      if (!mentor) {
        return res.status(404).json({ message: "Mentor not found" });
      }

      const favorite = await storage.addFavorite(email, bodyResult.data.mentorId);
      res.status(201).json(favorite);
    } catch (error) {
      res.status(500).json({ message: "Failed to add favorite" });
    }
  });

  app.delete("/api/mentees/:email/favorites/:mentorId", async (req, res) => {
    try {
      const { email, mentorId } = req.params;
      
      const mentee = await storage.getMenteeByEmail(email);
      if (!mentee) {
        return res.status(404).json({ message: "Mentee not found" });
      }

      await storage.removeFavorite(email, mentorId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to remove favorite" });
    }
  });

  app.post("/api/webhooks/calendly", async (req, res) => {
    try {
      const payload = req.body;

      if (!payload || typeof payload !== 'object') {
        return res.status(400).json({ message: "Invalid webhook payload" });
      }

      let sessionData;

      if (payload.event === "invitee.created" && payload.payload) {
        const calendlyPayload = payload.payload;
        
        const menteeName = calendlyPayload.name;
        const menteeEmail = calendlyPayload.email;
        const bookedAt = calendlyPayload.scheduled_event?.start_time;

        if (!menteeName || !menteeEmail) {
          return res.status(400).json({ 
            message: "Missing required fields: name or email" 
          });
        }

        let mentorId: string | undefined;
        if (calendlyPayload.questions_and_answers && Array.isArray(calendlyPayload.questions_and_answers)) {
          const mentorIdQuestion = calendlyPayload.questions_and_answers.find(
            (qa: any) => qa.question === "Mentor ID" || qa.question === "MentorID"
          );
          mentorId = mentorIdQuestion?.answer;
        }

        if (!mentorId) {
          return res.status(400).json({ 
            message: "Mentor ID not found in webhook payload" 
          });
        }

        sessionData = {
          mentorId,
          menteeName,
          menteeEmail,
        };
      } else if (payload.mentorId && payload.menteeName && payload.menteeEmail) {
        sessionData = {
          mentorId: payload.mentorId,
          menteeName: payload.menteeName,
          menteeEmail: payload.menteeEmail,
        };
      } else {
        return res.status(400).json({ 
          message: "Invalid payload format. Expected either Calendly webhook or simplified format." 
        });
      }

      const result = insertSessionSchema.safeParse(sessionData);
      
      if (!result.success) {
        return res.status(400).json({ 
          message: "Invalid session data",
          errors: result.error.errors 
        });
      }

      const mentor = await storage.getMentor(result.data.mentorId);
      if (!mentor) {
        return res.status(404).json({ message: "Mentor not found" });
      }

      const session = await storage.createSession(result.data);
      
      res.status(200).json({ 
        message: "Session created successfully",
        session 
      });
    } catch (error) {
      console.error("Webhook processing error:", error);
      res.status(500).json({ message: "Failed to process webhook" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
