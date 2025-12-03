import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertBookingSchema, insertMenteeSchema, insertMentorSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/mentors", async (req, res) => {
    try {
      const search = req.query.search as string | undefined;
      const expertise = req.query.expertise as string | undefined;
      const industry = req.query.industry as string | undefined;
      const language = req.query.language as string | undefined;
      
      const filters = {
        search: search || undefined,
        expertise: expertise || undefined,
        industry: industry || undefined,
        language: language || undefined,
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

  app.post("/api/mentors", async (req, res) => {
    try {
      const result = insertMentorSchema.safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json({ 
          message: "Invalid mentor data",
          errors: result.error.errors 
        });
      }

      const mentor = await storage.createMentor(result.data);
      res.status(201).json(mentor);
    } catch (error) {
      res.status(500).json({ message: "Failed to create mentor" });
    }
  });

  app.get("/api/bookings", async (_req, res) => {
    try {
      const bookings = await storage.getBookings();
      res.json(bookings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch bookings" });
    }
  });

  app.post("/api/bookings", async (req, res) => {
    try {
      const result = insertBookingSchema.safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json({ 
          message: "Invalid booking data",
          errors: result.error.errors 
        });
      }

      const mentor = await storage.getMentor(result.data.mentor_id);
      if (!mentor) {
        return res.status(404).json({ message: "Mentor not found" });
      }

      const booking = await storage.createBooking(result.data);
      res.status(201).json(booking);
    } catch (error) {
      res.status(500).json({ message: "Failed to create booking" });
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

  app.get("/api/mentees/:email/bookings", async (req, res) => {
    try {
      const { email } = req.params;
      
      const mentee = await storage.getMenteeByEmail(email);
      if (!mentee) {
        return res.status(404).json({ message: "Mentee not found" });
      }

      const bookings = await storage.getMenteeBookings(mentee.id);
      res.json(bookings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch mentee bookings" });
    }
  });

  app.post("/api/webhooks/calcom", async (req, res) => {
    try {
      const payload = req.body;

      if (!payload || typeof payload !== 'object') {
        return res.status(400).json({ message: "Invalid webhook payload" });
      }

      let mentorId: string | undefined;
      let menteeName: string | undefined;
      let menteeEmail: string | undefined;
      let calEventUri: string | undefined;
      let scheduledAt: string | undefined;

      if (payload.triggerEvent === "BOOKING_CREATED" && payload.payload) {
        const calPayload = payload.payload;
        
        const attendee = calPayload.attendees?.[0];
        menteeName = attendee?.name;
        menteeEmail = attendee?.email;
        scheduledAt = calPayload.startTime;
        calEventUri = calPayload.uid;

        if (!menteeName || !menteeEmail) {
          return res.status(400).json({ 
            message: "Missing required fields: name or email" 
          });
        }

        if (calPayload.metadata && calPayload.metadata.mentorId) {
          mentorId = calPayload.metadata.mentorId;
        } else if (calPayload.responses?.mentor_id) {
          mentorId = calPayload.responses.mentor_id.value;
        }

        if (!mentorId) {
          return res.status(400).json({ 
            message: "Mentor ID not found in webhook payload" 
          });
        }
      } else if (payload.mentor_id && payload.mentee_id) {
        const bookingData = {
          mentor_id: payload.mentor_id,
          mentee_id: payload.mentee_id,
          cal_event_uri: payload.cal_event_uri,
          status: payload.status || "clicked",
          scheduled_at: payload.scheduled_at,
        };

        const result = insertBookingSchema.safeParse(bookingData);
        
        if (!result.success) {
          return res.status(400).json({ 
            message: "Invalid booking data",
            errors: result.error.errors 
          });
        }

        const booking = await storage.createBooking(result.data);
        
        return res.status(200).json({ 
          message: "Booking created successfully",
          booking 
        });
      } else {
        return res.status(400).json({ 
          message: "Invalid payload format. Expected either Cal.com webhook or booking data with mentor_id and mentee_id." 
        });
      }

      const mentor = await storage.getMentor(mentorId);
      if (!mentor) {
        return res.status(404).json({ message: "Mentor not found" });
      }

      let mentee = await storage.getMenteeByEmail(menteeEmail);
      if (!mentee) {
        mentee = await storage.createMentee({
          name: menteeName,
          email: menteeEmail,
          user_type: "individual",
          timezone: "Africa/Cairo",
          languages_spoken: ["English"],
          areas_exploring: ["Career Development"],
        });
      }

      const booking = await storage.createBooking({
        mentor_id: mentorId,
        mentee_id: mentee.id,
        cal_event_uri: calEventUri,
        status: "scheduled",
        scheduled_at: scheduledAt,
      });
      
      res.status(200).json({ 
        message: "Booking created successfully",
        booking 
      });
    } catch (error) {
      console.error("Webhook processing error:", error);
      res.status(500).json({ message: "Failed to process webhook" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
