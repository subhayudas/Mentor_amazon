import type { Express, Request, Response } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { supabase, supabaseAdmin } from "./supabase";
import { insertBookingSchema, insertMenteeSchema, insertMentorSchema, insertBookingNoteSchema, insertNotificationSchema, insertUserSchema, insertMentorTaskSchema, insertMentorAvailabilitySchema, insertMentorActivityLogSchema } from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import path from "path";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

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

const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  user_type: z.enum(["mentor", "mentee"]),
  profile_id: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function registerRoutes(app: Express): Promise<Server> {
  app.use("/uploads", express.static("uploads"));

  app.post("/api/auth/signup", async (req: Request, res: Response) => {
    try {
      const result = signupSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({
          message: "Invalid signup data",
          errors: result.error.errors,
        });
      }

      const existingUser = await storage.getUserByEmail(result.data.email);
      if (existingUser) {
        return res.status(409).json({ message: "User with this email already exists" });
      }

      // Create user in Supabase Auth (using admin client to auto-confirm email)
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: result.data.email,
        password: result.data.password,
        email_confirm: true, // Auto-confirm email
        user_metadata: {
          user_type: result.data.user_type,
        }
      });

      if (authError) {
        console.error("Supabase signup error:", authError);
        return res.status(400).json({ message: authError.message });
      }

      if (!authData.user) {
        return res.status(500).json({ message: "Failed to create user" });
      }

      // Also create user in our database for backward compatibility
      const hashedPassword = await bcrypt.hash(result.data.password, 10);
      const user = await storage.createUser({
        ...result.data,
        id: authData.user.id, // Use Supabase user ID
        password: hashedPassword,
      });

      req.session.userId = user.id;
      
      // Save session explicitly to ensure it's persisted
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            console.error("Session save error:", err);
            reject(err);
          } else {
            console.log("Signup successful - Session saved:", req.sessionID);
            console.log("Signup successful - User ID:", req.session.userId);
            resolve();
          }
        });
      });

      const { password: _, ...userWithoutPassword } = user;
      res.status(201).json(userWithoutPassword);
    } catch (error) {
      console.error("Signup error:", error);
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const result = loginSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({
          message: "Invalid login data",
          errors: result.error.errors,
        });
      }

      // Try Supabase Auth first
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: result.data.email,
        password: result.data.password,
      });

      if (authError || !authData.user) {
        // Fallback to local auth for existing users
        const user = await storage.getUserByEmail(result.data.email);
        if (!user) {
          return res.status(401).json({ message: "Invalid email or password" });
        }

        const isPasswordValid = await bcrypt.compare(result.data.password, user.password);
        if (!isPasswordValid) {
          return res.status(401).json({ message: "Invalid email or password" });
        }

        req.session.userId = user.id;
        
        await new Promise<void>((resolve, reject) => {
          req.session.save((err) => {
            if (err) {
              console.error("Session save error:", err);
              reject(err);
            } else {
              console.log("Login successful - Session saved:", req.sessionID);
              console.log("Login successful - User ID:", req.session.userId);
              resolve();
            }
          });
        });

        const { password: _, ...userWithoutPassword } = user;
        return res.json(userWithoutPassword);
      }

      // Supabase auth successful - get user from our database
      const user = await storage.getUserById(authData.user.id);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      req.session.userId = user.id;
      
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            console.error("Session save error:", err);
            reject(err);
          } else {
            console.log("Login successful - Session saved:", req.sessionID);
            console.log("Login successful - User ID:", req.session.userId);
            resolve();
          }
        });
      });

      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Failed to login" });
    }
  });

  app.post("/api/auth/logout", async (req: Request, res: Response) => {
    try {
      req.session.destroy((err) => {
        if (err) {
          return res.status(500).json({ message: "Failed to logout" });
        }
        res.clearCookie("connect.sid");
        res.json({ message: "Logged out successfully" });
      });
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).json({ message: "Failed to logout" });
    }
  });

  app.get("/api/auth/me", async (req: Request, res: Response) => {
    try {
      console.log("Auth check - Session ID:", req.sessionID);
      console.log("Auth check - Session data:", req.session);
      console.log("Auth check - User ID:", req.session.userId);
      console.log("Auth check - Cookies:", req.headers.cookie);
      
      if (!req.session.userId) {
        console.log("No userId in session - returning 401");
        return res.status(401).json({ message: "Not authenticated" });
      }

      const user = await storage.getUserById(req.session.userId);
      if (!user) {
        console.log("User not found in database - destroying session");
        req.session.destroy(() => {});
        return res.status(401).json({ message: "User not found" });
      }

      const { password: _, ...userWithoutPassword } = user;
      console.log("Auth successful - returning user:", userWithoutPassword.email);
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Get current user error:", error);
      res.status(500).json({ message: "Failed to get current user" });
    }
  });

  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    try {
      const result = forgotPasswordSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({
          message: "Invalid email",
          errors: result.error.errors,
        });
      }

      // Use Supabase password reset
      const { error } = await supabase.auth.resetPasswordForEmail(result.data.email, {
        redirectTo: `${req.protocol}://${req.get('host')}/reset-password`,
      });

      if (error) {
        console.error("Supabase forgot password error:", error);
      }

      // Also update local database for backward compatibility
      const user = await storage.getUserByEmail(result.data.email);
      if (user) {
        const resetToken = randomUUID();
        const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        await storage.updateUserResetToken(user.id, resetToken, expires);
      }

      res.json({ message: "If an account exists, a reset link will be sent" });
    } catch (error) {
      console.error("Forgot password error:", error);
      res.status(500).json({ message: "Failed to process forgot password request" });
    }
  });

  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    try {
      const result = resetPasswordSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({
          message: "Invalid reset data",
          errors: result.error.errors,
        });
      }

      // Check if token is a Supabase access token or our custom token
      const user = await storage.getUserByResetToken(result.data.token);

      if (user) {
        // Using our custom reset token
        if (!user.reset_token_expires) {
          return res.status(400).json({ message: "Invalid or expired reset token" });
        }

        const expires = new Date(user.reset_token_expires);
        if (expires < new Date()) {
          return res.status(400).json({ message: "Reset token has expired" });
        }

        const hashedPassword = await bcrypt.hash(result.data.password, 10);
        await storage.updateUserPassword(user.id, hashedPassword);

        res.json({ message: "Password reset successfully" });
      } else {
        // Assume it's a Supabase reset - let frontend handle this
        res.status(400).json({ message: "Invalid or expired reset token" });
      }
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

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
        status: "pending" as const,
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
          type: "booking_request",
          title: "New Session Booked",
          message: `${mentee.name} has booked a mentorship session with you.`,
          booking_id: booking.id,
        });

        // Notify mentee
        await storage.createNotification({
          recipient_email: mentee.email,
          recipient_type: "mentee",
          type: "booking_request",
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

  app.get("/api/mentees/email/:email", async (req, res) => {
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

  app.get("/api/mentees/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const mentee = await storage.getMenteeById(id);
      
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

      // First try to find and confirm an existing accepted booking
      const confirmedBooking = await storage.findAndConfirmAcceptedBooking(
        mentorId, 
        menteeEmail!, 
        calEventUri, 
        scheduledAt
      );
      
      if (confirmedBooking) {
        // Create confirmation notifications
        const mentee = await storage.getMenteeByEmail(menteeEmail!);
        if (mentee) {
          await storage.createNotification({
            recipient_email: mentor.email,
            recipient_type: "mentor",
            type: "booking_confirmed",
            title: "Session Confirmed",
            message: `${mentee.name} has scheduled their session with you.`,
            booking_id: confirmedBooking.id,
          });
          
          await storage.createNotification({
            recipient_email: mentee.email,
            recipient_type: "mentee",
            type: "booking_confirmed",
            title: "Session Scheduled",
            message: `Your session with ${mentor.name} has been scheduled successfully.`,
            booking_id: confirmedBooking.id,
          });
        }
        
        return res.status(200).json({ 
          message: "Booking confirmed successfully",
          booking: confirmedBooking 
        });
      }

      // Fallback: create new booking if no accepted booking exists
      let mentee = await storage.getMenteeByEmail(menteeEmail!);
      if (!mentee) {
        mentee = await storage.createMentee({
          name: menteeName!,
          email: menteeEmail!,
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
        status: "confirmed",
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

  // Update mentor profile
  app.patch("/api/mentors/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const mentor = await storage.updateMentor(id, updates);
      if (!mentor) {
        return res.status(404).json({ message: "Mentor not found" });
      }

      res.json(mentor);
    } catch (error) {
      res.status(500).json({ message: "Failed to update mentor profile" });
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

  // Booking request endpoints
  app.post("/api/bookings/request", async (req, res) => {
    try {
      const { mentor_id, mentee_name, mentee_email, goal } = req.body;

      if (!mentor_id || !mentee_email || !goal) {
        return res.status(400).json({ message: "mentor_id, mentee_email, and goal are required" });
      }

      const mentor = await storage.getMentor(mentor_id);
      if (!mentor) {
        return res.status(404).json({ message: "Mentor not found" });
      }

      // Get or create mentee
      let mentee = await storage.getMenteeByEmail(mentee_email);
      if (!mentee) {
        mentee = await storage.createMentee({
          name: mentee_name || "Anonymous",
          email: mentee_email,
          user_type: "individual",
          timezone: "UTC",
          languages_spoken: ["English"],
          areas_exploring: ["Career Development"],
        });
      }

      const booking = await storage.createBookingRequest(mentor_id, mentee.id, goal);

      // Notify mentor about the new booking request
      await storage.createNotification({
        recipient_email: mentor.email,
        recipient_type: "mentor",
        type: "booking_request",
        title: "New Booking Request",
        message: `${mentee.name} has requested a mentorship session with you. Goal: ${goal}`,
        booking_id: booking.id,
      });

      res.status(201).json(booking);
    } catch (error) {
      console.error("Booking request error:", error);
      res.status(500).json({ message: "Failed to create booking request" });
    }
  });

  app.patch("/api/bookings/:id/accept", async (req, res) => {
    try {
      const { id } = req.params;

      const existingBooking = await storage.getBooking(id);
      if (!existingBooking) {
        return res.status(404).json({ message: "Booking not found" });
      }

      if (existingBooking.status !== "pending") {
        return res.status(400).json({ message: "Booking is not in pending status" });
      }

      const booking = await storage.acceptBooking(id);
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }

      // Get mentor info for Cal link
      const mentor = await storage.getMentor(booking.mentor_id);
      const mentee = await storage.getMentee(booking.mentee_id);

      if (mentee && mentor) {
        const calLink = mentor.cal_link ? `https://cal.com/${mentor.cal_link}` : "";
        await storage.createNotification({
          recipient_email: mentee.email,
          recipient_type: "mentee",
          type: "booking_accepted",
          title: "Booking Request Accepted",
          message: `${mentor.name} has accepted your mentorship request.${calLink ? ` Schedule your session: ${calLink}` : ""}`,
          booking_id: booking.id,
        });

        // Send email notification to mentee
        if (process.env.RESEND_API_KEY && calLink) {
          try {
            await resend.emails.send({
              from: "onboarding@resend.dev",
              to: mentee.email,
              subject: `Your Mentorship Request Has Been Accepted - ${mentor.name}`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #232F3E;">Great News! 🎉</h2>
                  <p>Hi ${mentee.name},</p>
                  <p><strong>${mentor.name}</strong> has accepted your mentorship request!</p>
                  <p>Please book a time for your session using the link below:</p>
                  <p style="margin: 24px 0;">
                    <a href="${calLink}" style="background-color: #FF9900; color: #232F3E; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">
                      Schedule Your Session
                    </a>
                  </p>
                  <p>Or copy this link: <a href="${calLink}">${calLink}</a></p>
                  <p style="color: #666; font-size: 14px; margin-top: 32px;">
                    Best regards,<br/>
                    MentorConnect Team
                  </p>
                </div>
              `,
            });
            console.log(`Email sent to ${mentee.email} for booking ${booking.id}`);
          } catch (emailError) {
            console.error("Failed to send email notification:", emailError);
            // Don't fail the request if email fails
          }
        }
      }

      res.json(booking);
    } catch (error) {
      console.error("Accept booking error:", error);
      res.status(500).json({ message: "Failed to accept booking" });
    }
  });

  app.patch("/api/bookings/:id/decline", async (req, res) => {
    try {
      const { id } = req.params;

      const existingBooking = await storage.getBooking(id);
      if (!existingBooking) {
        return res.status(404).json({ message: "Booking not found" });
      }

      if (existingBooking.status !== "pending") {
        return res.status(400).json({ message: "Booking is not in pending status" });
      }

      const booking = await storage.declineBooking(id);
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }

      // Get mentor info for notification
      const mentor = await storage.getMentor(booking.mentor_id);
      const mentee = await storage.getMentee(booking.mentee_id);

      if (mentee && mentor) {
        await storage.createNotification({
          recipient_email: mentee.email,
          recipient_type: "mentee",
          type: "booking_rejected",
          title: "Booking Request Declined",
          message: `${mentor.name} was unable to accept your mentorship request at this time.`,
          booking_id: booking.id,
        });
      }

      res.json(booking);
    } catch (error) {
      console.error("Decline booking error:", error);
      res.status(500).json({ message: "Failed to decline booking" });
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

  // Mentor Dashboard endpoints
  app.get("/api/mentor/:mentorId/dashboard", async (req, res) => {
    try {
      const { mentorId } = req.params;
      
      const mentor = await storage.getMentor(mentorId);
      if (!mentor) {
        return res.status(404).json({ message: "Mentor not found" });
      }
      
      const stats = await storage.getMentorDashboardStats(mentorId);
      res.json(stats);
    } catch (error) {
      console.error("Dashboard stats error:", error);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  app.get("/api/mentor/:mentorId/bookings", async (req, res) => {
    try {
      const { mentorId } = req.params;
      const status = req.query.status as string | undefined;
      
      const mentor = await storage.getMentor(mentorId);
      if (!mentor) {
        return res.status(404).json({ message: "Mentor not found" });
      }
      
      const mentorBookings = await storage.getMentorBookingsWithStatus(mentorId, status);
      res.json(mentorBookings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch mentor bookings" });
    }
  });

  app.get("/api/mentor/:mentorId/bookings/pending", async (req, res) => {
    try {
      const { mentorId } = req.params;
      
      const mentor = await storage.getMentor(mentorId);
      if (!mentor) {
        return res.status(404).json({ message: "Mentor not found" });
      }
      
      const pendingBookings = await storage.getPendingBookingsForMentor(mentorId);
      res.json(pendingBookings);
    } catch (error) {
      console.error("Pending bookings error:", error);
      res.status(500).json({ message: "Failed to fetch pending bookings" });
    }
  });

  app.patch("/api/mentor/:mentorId/bookings/:bookingId", async (req, res) => {
    try {
      const { mentorId, bookingId } = req.params;
      const { status } = req.body;
      
      if (!status) {
        return res.status(400).json({ message: "Status is required" });
      }
      
      const validStatuses = ["clicked", "scheduled", "completed", "canceled"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status value" });
      }
      
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }
      
      if (booking.mentor_id !== mentorId) {
        return res.status(403).json({ message: "Booking does not belong to this mentor" });
      }
      
      const updatedBooking = await storage.updateBookingStatus(bookingId, status);
      res.json(updatedBooking);
    } catch (error) {
      res.status(500).json({ message: "Failed to update booking status" });
    }
  });

  app.get("/api/mentor/:mentorId/tasks", async (req, res) => {
    try {
      const { mentorId } = req.params;
      
      const mentor = await storage.getMentor(mentorId);
      if (!mentor) {
        return res.status(404).json({ message: "Mentor not found" });
      }
      
      const tasks = await storage.getMentorTasks(mentorId);
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch mentor tasks" });
    }
  });

  app.post("/api/mentor/:mentorId/tasks", async (req, res) => {
    try {
      const { mentorId } = req.params;
      
      const mentor = await storage.getMentor(mentorId);
      if (!mentor) {
        return res.status(404).json({ message: "Mentor not found" });
      }
      
      const taskData = {
        ...req.body,
        mentor_id: mentorId,
      };
      
      const result = insertMentorTaskSchema.safeParse(taskData);
      if (!result.success) {
        return res.status(400).json({
          message: "Invalid task data",
          errors: result.error.errors,
        });
      }
      
      const task = await storage.createMentorTask(result.data);
      res.status(201).json(task);
    } catch (error) {
      res.status(500).json({ message: "Failed to create task" });
    }
  });

  app.patch("/api/mentor/:mentorId/tasks/:taskId", async (req, res) => {
    try {
      const { mentorId, taskId } = req.params;
      const updates = req.body;
      
      const task = await storage.updateMentorTask(taskId, updates);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      if (task.mentor_id !== mentorId) {
        return res.status(403).json({ message: "Task does not belong to this mentor" });
      }
      
      res.json(task);
    } catch (error) {
      res.status(500).json({ message: "Failed to update task" });
    }
  });

  app.get("/api/mentor/:mentorId/availability", async (req, res) => {
    try {
      const { mentorId } = req.params;
      
      const mentor = await storage.getMentor(mentorId);
      if (!mentor) {
        return res.status(404).json({ message: "Mentor not found" });
      }
      
      const availability = await storage.getMentorAvailabilitySlots(mentorId);
      res.json(availability);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch mentor availability" });
    }
  });

  app.put("/api/mentor/:mentorId/availability", async (req, res) => {
    try {
      const { mentorId } = req.params;
      const { slots } = req.body;
      
      const mentor = await storage.getMentor(mentorId);
      if (!mentor) {
        return res.status(404).json({ message: "Mentor not found" });
      }
      
      if (!Array.isArray(slots)) {
        return res.status(400).json({ message: "Slots must be an array" });
      }
      
      // Validate each slot
      for (const slot of slots) {
        const result = insertMentorAvailabilitySchema.safeParse({
          ...slot,
          mentor_id: mentorId,
        });
        if (!result.success) {
          return res.status(400).json({
            message: "Invalid availability slot data",
            errors: result.error.errors,
          });
        }
      }
      
      const availability = await storage.setMentorAvailability(mentorId, slots);
      res.json(availability);
    } catch (error) {
      res.status(500).json({ message: "Failed to set mentor availability" });
    }
  });

  app.get("/api/mentor/:mentorId/earnings", async (req, res) => {
    try {
      const { mentorId } = req.params;
      
      const mentor = await storage.getMentor(mentorId);
      if (!mentor) {
        return res.status(404).json({ message: "Mentor not found" });
      }
      
      const earnings = await storage.getMentorEarnings(mentorId);
      res.json(earnings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch mentor earnings" });
    }
  });

  app.get("/api/mentor/:mentorId/activity", async (req, res) => {
    try {
      const { mentorId } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      
      const mentor = await storage.getMentor(mentorId);
      if (!mentor) {
        return res.status(404).json({ message: "Mentor not found" });
      }
      
      const activity = await storage.getMentorActivityLog(mentorId, limit);
      res.json(activity);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch mentor activity log" });
    }
  });

  // Feedback routes - mentee submitting feedback for mentor
  app.post("/api/bookings/:bookingId/mentee-feedback", async (req, res) => {
    try {
      const { bookingId } = req.params;
      const { rating, feedback, menteeEmail } = req.body;
      
      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ message: "Rating must be between 1 and 5" });
      }
      
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }
      
      const mentee = await storage.getMentee(booking.mentee_id);
      if (!mentee || (menteeEmail && mentee.email !== menteeEmail)) {
        return res.status(403).json({ message: "Not authorized to submit feedback for this booking" });
      }
      
      const updatedBooking = await storage.submitMenteeFeedback(bookingId, rating, feedback || "");
      
      // Update mentor's average rating
      await storage.updateMentorRating(booking.mentor_id);
      
      // Create notification for mentor that they received feedback
      const mentor = await storage.getMentor(booking.mentor_id);
      if (mentor) {
        await storage.createNotification({
          recipient_email: mentor.email,
          recipient_type: 'mentor',
          type: 'feedback_received',
          title: 'New Feedback Received',
          message: `${mentee.name} has left you feedback and rated your session ${rating}/5 stars.${feedback ? ` Their feedback: "${feedback}"` : ''}`,
          booking_id: bookingId
        });
      }
      
      res.json(updatedBooking);
    } catch (error) {
      console.error("Submit mentee feedback error:", error);
      res.status(500).json({ message: "Failed to submit feedback" });
    }
  });

  // Mentor submitting feedback for mentee
  app.post("/api/bookings/:bookingId/mentor-feedback", async (req, res) => {
    try {
      const { bookingId } = req.params;
      // Accept both naming conventions: mentor_rating/mentor_feedback or rating/feedback
      const { mentor_rating, mentor_feedback, rating, feedback, mentorEmail } = req.body;
      const actualRating = mentor_rating ?? rating;
      const actualFeedback = mentor_feedback ?? feedback ?? "";
      
      if (!actualRating || actualRating < 1 || actualRating > 5) {
        return res.status(400).json({ message: "Rating must be between 1 and 5" });
      }
      
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }
      
      const mentor = await storage.getMentor(booking.mentor_id);
      if (!mentor || (mentorEmail && mentor.email !== mentorEmail)) {
        return res.status(403).json({ message: "Not authorized to submit feedback for this booking" });
      }
      
      const updatedBooking = await storage.submitMentorFeedback(bookingId, actualRating, actualFeedback);
      
      // Create notification for mentee that they received feedback from mentor
      const mentee = await storage.getMentee(booking.mentee_id);
      if (mentee) {
        await storage.createNotification({
          recipient_email: mentee.email,
          recipient_type: 'mentee',
          type: 'feedback_received',
          title: 'New Feedback from Mentor',
          message: `${mentor.name} has left you feedback and rated your session ${actualRating}/5 stars.${actualFeedback ? ` Their feedback: "${actualFeedback}"` : ''}`,
          booking_id: bookingId
        });
      }
      
      res.json(updatedBooking);
    } catch (error) {
      console.error("Submit mentor feedback error:", error);
      res.status(500).json({ message: "Failed to submit feedback" });
    }
  });

  // Get all feedback received by mentor (from mentees)
  app.get("/api/mentor/:mentorId/feedback", async (req, res) => {
    try {
      const { mentorId } = req.params;
      
      const mentor = await storage.getMentor(mentorId);
      if (!mentor) {
        return res.status(404).json({ message: "Mentor not found" });
      }
      
      const feedback = await storage.getMentorFeedback(mentorId);
      res.json(feedback);
    } catch (error) {
      console.error("Get mentor feedback error:", error);
      res.status(500).json({ message: "Failed to fetch feedback" });
    }
  });

  // Get all feedback received by mentee (from mentors)
  app.get("/api/mentee/:menteeId/feedback", async (req, res) => {
    try {
      const { menteeId } = req.params;
      
      const mentee = await storage.getMentee(menteeId);
      if (!mentee) {
        return res.status(404).json({ message: "Mentee not found" });
      }
      
      const feedback = await storage.getMenteeFeedback(menteeId);
      res.json(feedback);
    } catch (error) {
      console.error("Get mentee feedback error:", error);
      res.status(500).json({ message: "Failed to fetch feedback" });
    }
  });

  // Get mentee's bookings with mentor details
  app.get("/api/mentee/:menteeId/bookings", async (req, res) => {
    try {
      const { menteeId } = req.params;
      const status = req.query.status as string | undefined;
      
      const mentee = await storage.getMentee(menteeId);
      if (!mentee) {
        return res.status(404).json({ message: "Mentee not found" });
      }
      
      const bookings = await storage.getMenteeBookings(menteeId, status);
      res.json(bookings);
    } catch (error) {
      console.error("Get mentee bookings error:", error);
      res.status(500).json({ message: "Failed to fetch mentee bookings" });
    }
  });

  // Get mentee's dashboard stats
  app.get("/api/mentee/:menteeId/stats", async (req, res) => {
    try {
      const { menteeId } = req.params;
      
      const mentee = await storage.getMentee(menteeId);
      if (!mentee) {
        return res.status(404).json({ message: "Mentee not found" });
      }
      
      const stats = await storage.getMenteeStats(menteeId);
      res.json(stats);
    } catch (error) {
      console.error("Get mentee stats error:", error);
      res.status(500).json({ message: "Failed to fetch mentee stats" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
