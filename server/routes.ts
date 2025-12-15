import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertBookingSchema, insertMenteeSchema, insertMentorSchema, insertBookingNoteSchema, insertNotificationSchema } from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import path from "path";
import { randomUUID } from "crypto";

const uploadStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, "uploads/");
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
  app.use("/uploads", express.static("uploads"));

  app.post("/api/uploads", (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        if (err.message === "Only image files are allowed") {
          return res.status(400).json({ message: "Only image files are allowed" });
        }
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ message: "File size exceeds 5MB limit" });
        }
        return res.status(500).json({ message: "Upload failed" });
      }
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      const url = `/uploads/${req.file.filename}`;
      res.json({ url });
    });
  });

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

  app.get("/api/mentors/email/:email", async (req, res) => {
    try {
      const { email } = req.params;
      const mentor = await storage.getMentorByEmail(email);
      
      if (!mentor) {
        return res.status(404).json({ message: "Mentor not found" });
      }
      
      res.json(mentor);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch mentor" });
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

  app.get("/api/mentors/:id/bookings", async (req, res) => {
    try {
      const { id } = req.params;
      const mentor = await storage.getMentor(id);
      
      if (!mentor) {
        return res.status(404).json({ message: "Mentor not found" });
      }

      const mentorBookings = await storage.getMentorBookings(id);
      res.json(mentorBookings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch mentor bookings" });
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

      if (result.data.comms_owner === "assistant") {
        if (!result.data.assistant_email || result.data.assistant_email.trim() === "") {
          return res.status(400).json({
            message: "Assistant email is required when communication owner is 'Assistant'",
            errors: [{ path: ["assistant_email"], message: "Assistant email is required" }]
          });
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(result.data.assistant_email)) {
          return res.status(400).json({
            message: "Invalid assistant email format",
            errors: [{ path: ["assistant_email"], message: "Invalid email format" }]
          });
        }
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
      const { mentor_id, mentee_name, mentee_email, mentee_id } = req.body;

      // Validate required fields
      if (!mentor_id) {
        return res.status(400).json({ message: "mentor_id is required" });
      }

      const mentor = await storage.getMentor(mentor_id);
      if (!mentor) {
        return res.status(404).json({ message: "Mentor not found" });
      }

      let resolvedMenteeId = mentee_id;

      // If mentee_id not provided, look up or create mentee by email
      if (!resolvedMenteeId && mentee_email) {
        let mentee = await storage.getMenteeByEmail(mentee_email);
        if (!mentee) {
          // Create mentee if not exists with minimal required fields
          mentee = await storage.createMentee({
            name: mentee_name || "Anonymous",
            email: mentee_email,
            user_type: "individual",
            timezone: "UTC",
            languages_spoken: ["English"],
            areas_exploring: ["Career Development"],
          });
        }
        resolvedMenteeId = mentee.id;
      }

      if (!resolvedMenteeId) {
        return res.status(400).json({ message: "Either mentee_id or mentee_email is required" });
      }

      const bookingData = {
        mentor_id,
        mentee_id: resolvedMenteeId,
        status: "clicked" as const,
        clicked_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };

      const booking = await storage.createBooking(bookingData);

      // Create notifications for both mentor and mentee
      const mentee = await storage.getMenteeByEmail(mentee_email);
      if (mentor && mentee) {
        // Notify mentor
        await storage.createNotification({
          recipient_email: mentor.email,
          recipient_type: "mentor",
          type: "booking_created",
          title: "New Session Booked",
          message: `${mentee.name} has booked a mentorship session with you.`,
          booking_id: booking.id,
        });

        // Notify mentee
        await storage.createNotification({
          recipient_email: mentee.email,
          recipient_type: "mentee",
          type: "booking_created",
          title: "Session Confirmed",
          message: `Your session with ${mentor.name} has been booked successfully.`,
          booking_id: booking.id,
        });
      }

      res.status(201).json(booking);
    } catch (error) {
      console.error("Booking creation error:", error);
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

  // Mentor availability toggle
  app.patch("/api/mentors/:id/availability", async (req, res) => {
    try {
      const { id } = req.params;
      const { is_available } = req.body;
      
      if (typeof is_available !== "boolean") {
        return res.status(400).json({ message: "is_available must be a boolean" });
      }

      const mentor = await storage.updateMentorAvailability(id, is_available);
      if (!mentor) {
        return res.status(404).json({ message: "Mentor not found" });
      }

      res.json(mentor);
    } catch (error) {
      res.status(500).json({ message: "Failed to update mentor availability" });
    }
  });

  // Update mentee profile
  app.patch("/api/mentees/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const mentee = await storage.updateMentee(id, updates);
      if (!mentee) {
        return res.status(404).json({ message: "Mentee not found" });
      }

      res.json(mentee);
    } catch (error) {
      res.status(500).json({ message: "Failed to update mentee" });
    }
  });

  // Booking notes endpoints
  app.get("/api/bookings/:bookingId/notes", async (req, res) => {
    try {
      const { bookingId } = req.params;
      
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }

      const notes = await storage.getBookingNotes(bookingId);
      res.json(notes);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch booking notes" });
    }
  });

  app.post("/api/bookings/:bookingId/notes", async (req, res) => {
    try {
      const { bookingId } = req.params;
      
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }

      const noteData = {
        ...req.body,
        booking_id: bookingId,
      };

      const result = insertBookingNoteSchema.safeParse(noteData);
      if (!result.success) {
        return res.status(400).json({ 
          message: "Invalid note data",
          errors: result.error.errors 
        });
      }

      const note = await storage.createBookingNote(result.data);
      res.status(201).json(note);
    } catch (error) {
      res.status(500).json({ message: "Failed to create booking note" });
    }
  });

  app.patch("/api/bookings/:bookingId/notes/:noteId", async (req, res) => {
    try {
      const { noteId } = req.params;
      const updates = req.body;

      const note = await storage.updateBookingNote(noteId, updates);
      if (!note) {
        return res.status(404).json({ message: "Note not found" });
      }

      res.json(note);
    } catch (error) {
      res.status(500).json({ message: "Failed to update note" });
    }
  });

  app.delete("/api/bookings/:bookingId/notes/:noteId", async (req, res) => {
    try {
      const { noteId } = req.params;

      const deleted = await storage.deleteBookingNote(noteId);
      if (!deleted) {
        return res.status(404).json({ message: "Note not found" });
      }

      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete note" });
    }
  });

  // Notification endpoints
  app.get("/api/notifications/:email", async (req, res) => {
    try {
      const { email } = req.params;
      const notifications = await storage.getNotifications(email);
      res.json(notifications);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  app.get("/api/notifications/:email/unread-count", async (req, res) => {
    try {
      const { email } = req.params;
      const count = await storage.getUnreadNotificationCount(email);
      res.json({ count });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch unread count" });
    }
  });

  app.patch("/api/notifications/:id/read", async (req, res) => {
    try {
      const { id } = req.params;
      const notification = await storage.markNotificationAsRead(id);
      if (!notification) {
        return res.status(404).json({ message: "Notification not found" });
      }
      res.json(notification);
    } catch (error) {
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  app.patch("/api/notifications/:email/mark-all-read", async (req, res) => {
    try {
      const { email } = req.params;
      await storage.markAllNotificationsAsRead(email);
      res.json({ message: "All notifications marked as read" });
    } catch (error) {
      res.status(500).json({ message: "Failed to mark all notifications as read" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
