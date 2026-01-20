-- MentorConnect Supabase Setup Script
-- Run this in your Supabase SQL Editor to set up Row Level Security policies

-- ============================================
-- ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- ============================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentors ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentees ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentor_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentor_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentor_earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentor_activity_log ENABLE ROW LEVEL SECURITY;

-- ============================================
-- USERS TABLE POLICIES
-- ============================================

-- Users can view their own profile
CREATE POLICY "Users can view their own profile"
ON users FOR SELECT
TO authenticated
USING (auth.uid()::text = id);

-- Users can insert their own profile (during signup)
CREATE POLICY "Users can insert their own profile"
ON users FOR INSERT
TO authenticated
WITH CHECK (auth.uid()::text = id);

-- Users can update their own profile
CREATE POLICY "Users can update their own profile"
ON users FOR UPDATE
TO authenticated
USING (auth.uid()::text = id);

-- ============================================
-- MENTORS TABLE POLICIES
-- ============================================

-- Anyone can view mentor profiles (public directory)
CREATE POLICY "Anyone can view mentors"
ON mentors FOR SELECT
TO public
USING (true);

-- Authenticated users can insert mentor profiles
CREATE POLICY "Authenticated users can create mentor profiles"
ON mentors FOR INSERT
TO authenticated
WITH CHECK (true);

-- Mentors can update their own profile
CREATE POLICY "Mentors can update their own profile"
ON mentors FOR UPDATE
TO authenticated
USING (email = (auth.jwt() ->> 'email'));

-- ============================================
-- MENTEES TABLE POLICIES
-- ============================================

-- Authenticated users can view mentees
CREATE POLICY "Authenticated users can view mentees"
ON mentees FOR SELECT
TO authenticated
USING (true);

-- Anyone can create a mentee profile (for booking requests)
CREATE POLICY "Anyone can create mentee profiles"
ON mentees FOR INSERT
TO public
WITH CHECK (true);

-- Mentees can update their own profile
CREATE POLICY "Mentees can update their own profile"
ON mentees FOR UPDATE
TO authenticated
USING (email = (auth.jwt() ->> 'email'));

-- ============================================
-- BOOKINGS TABLE POLICIES
-- ============================================

-- Users can view their own bookings (as mentor or mentee)
CREATE POLICY "Users can view their own bookings"
ON bookings FOR SELECT
TO authenticated
USING (
  mentor_id IN (SELECT id FROM mentors WHERE email = (auth.jwt() ->> 'email'))
  OR mentee_id IN (SELECT id FROM mentees WHERE email = (auth.jwt() ->> 'email'))
);

-- Anyone can create bookings (including anonymous mentees)
CREATE POLICY "Anyone can create bookings"
ON bookings FOR INSERT
TO public
WITH CHECK (true);

-- Users can update their own bookings
CREATE POLICY "Users can update their own bookings"
ON bookings FOR UPDATE
TO authenticated
USING (
  mentor_id IN (SELECT id FROM mentors WHERE email = (auth.jwt() ->> 'email'))
  OR mentee_id IN (SELECT id FROM mentees WHERE email = (auth.jwt() ->> 'email'))
);

-- ============================================
-- BOOKING NOTES TABLE POLICIES
-- ============================================

-- Users can view notes for their own bookings
CREATE POLICY "Users can view their booking notes"
ON booking_notes FOR SELECT
TO authenticated
USING (
  booking_id IN (
    SELECT id FROM bookings 
    WHERE mentor_id IN (SELECT id FROM mentors WHERE email = (auth.jwt() ->> 'email'))
       OR mentee_id IN (SELECT id FROM mentees WHERE email = (auth.jwt() ->> 'email'))
  )
);

-- Users can create notes for their bookings
CREATE POLICY "Users can create booking notes"
ON booking_notes FOR INSERT
TO authenticated
WITH CHECK (
  booking_id IN (
    SELECT id FROM bookings 
    WHERE mentor_id IN (SELECT id FROM mentors WHERE email = (auth.jwt() ->> 'email'))
       OR mentee_id IN (SELECT id FROM mentees WHERE email = (auth.jwt() ->> 'email'))
  )
);

-- Users can update their own notes
CREATE POLICY "Users can update their own notes"
ON booking_notes FOR UPDATE
TO authenticated
USING (author_email = (auth.jwt() ->> 'email'));

-- Users can delete their own notes
CREATE POLICY "Users can delete their own notes"
ON booking_notes FOR DELETE
TO authenticated
USING (author_email = (auth.jwt() ->> 'email'));

-- ============================================
-- NOTIFICATIONS TABLE POLICIES
-- ============================================

-- Users can view their own notifications
CREATE POLICY "Users can view their own notifications"
ON notifications FOR SELECT
TO authenticated
USING (recipient_email = (auth.jwt() ->> 'email'));

-- System can create notifications (authenticated users)
CREATE POLICY "System can create notifications"
ON notifications FOR INSERT
TO authenticated
WITH CHECK (true);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update their own notifications"
ON notifications FOR UPDATE
TO authenticated
USING (recipient_email = (auth.jwt() ->> 'email'));

-- ============================================
-- MENTOR TASKS TABLE POLICIES
-- ============================================

-- Mentors can view their own tasks
CREATE POLICY "Mentors can view their own tasks"
ON mentor_tasks FOR SELECT
TO authenticated
USING (
  mentor_id IN (SELECT id FROM mentors WHERE email = (auth.jwt() ->> 'email'))
);

-- Mentors can create their own tasks
CREATE POLICY "Mentors can create their own tasks"
ON mentor_tasks FOR INSERT
TO authenticated
WITH CHECK (
  mentor_id IN (SELECT id FROM mentors WHERE email = (auth.jwt() ->> 'email'))
);

-- Mentors can update their own tasks
CREATE POLICY "Mentors can update their own tasks"
ON mentor_tasks FOR UPDATE
TO authenticated
USING (
  mentor_id IN (SELECT id FROM mentors WHERE email = (auth.jwt() ->> 'email'))
);

-- Mentors can delete their own tasks
CREATE POLICY "Mentors can delete their own tasks"
ON mentor_tasks FOR DELETE
TO authenticated
USING (
  mentor_id IN (SELECT id FROM mentors WHERE email = (auth.jwt() ->> 'email'))
);

-- ============================================
-- MENTOR AVAILABILITY TABLE POLICIES
-- ============================================

-- Anyone can view mentor availability (public)
CREATE POLICY "Anyone can view mentor availability"
ON mentor_availability FOR SELECT
TO public
USING (true);

-- Mentors can manage their own availability
CREATE POLICY "Mentors can manage their own availability"
ON mentor_availability FOR ALL
TO authenticated
USING (
  mentor_id IN (SELECT id FROM mentors WHERE email = (auth.jwt() ->> 'email'))
);

-- ============================================
-- MENTOR EARNINGS TABLE POLICIES
-- ============================================

-- Mentors can view their own earnings
CREATE POLICY "Mentors can view their own earnings"
ON mentor_earnings FOR SELECT
TO authenticated
USING (
  mentor_id IN (SELECT id FROM mentors WHERE email = (auth.jwt() ->> 'email'))
);

-- System can create earnings records
CREATE POLICY "System can create earnings"
ON mentor_earnings FOR INSERT
TO authenticated
WITH CHECK (true);

-- ============================================
-- MENTOR ACTIVITY LOG TABLE POLICIES
-- ============================================

-- Mentors can view their own activity
CREATE POLICY "Mentors can view their own activity"
ON mentor_activity_log FOR SELECT
TO authenticated
USING (
  mentor_id IN (SELECT id FROM mentors WHERE email = (auth.jwt() ->> 'email'))
);

-- System can log activity
CREATE POLICY "System can log activity"
ON mentor_activity_log FOR INSERT
TO authenticated
WITH CHECK (true);

-- ============================================
-- STORAGE POLICIES (for uploads bucket)
-- ============================================

-- Note: Run these in the Storage section of Supabase Dashboard
-- Or use the Storage SQL editor

-- Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'uploads');

-- Allow anyone to view uploaded files (public bucket)
CREATE POLICY "Anyone can view uploaded files"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'uploads');

-- Allow users to update their own files
CREATE POLICY "Users can update their own files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'uploads' AND auth.uid()::text = owner);

-- Allow users to delete their own files
CREATE POLICY "Users can delete their own files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'uploads' AND auth.uid()::text = owner);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers to tables with updated_at
CREATE TRIGGER update_mentors_updated_at BEFORE UPDATE ON mentors
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_mentor_tasks_updated_at BEFORE UPDATE ON mentor_tasks
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Mentors table indexes
CREATE INDEX IF NOT EXISTS idx_mentors_email ON mentors(email);
CREATE INDEX IF NOT EXISTS idx_mentors_is_available ON mentors(is_available);
CREATE INDEX IF NOT EXISTS idx_mentors_created_at ON mentors(created_at DESC);

-- Mentees table indexes
CREATE INDEX IF NOT EXISTS idx_mentees_email ON mentees(email);

-- Bookings table indexes
CREATE INDEX IF NOT EXISTS idx_bookings_mentor_id ON bookings(mentor_id);
CREATE INDEX IF NOT EXISTS idx_bookings_mentee_id ON bookings(mentee_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON bookings(created_at DESC);

-- Notifications table indexes
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_email ON notifications(recipient_email);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Run these to verify setup:
-- SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public';
-- SELECT * FROM storage.buckets;
-- SELECT indexname, tablename FROM pg_indexes WHERE schemaname = 'public';

-- ============================================
-- NOTES
-- ============================================

-- 1. Make sure to create the 'uploads' storage bucket in Supabase Dashboard
-- 2. Set the bucket to public or configure appropriate storage policies
-- 3. Test RLS policies thoroughly before deploying to production
-- 4. Monitor Supabase logs for policy violations during testing
-- 5. Consider adding rate limiting via Supabase's built-in features

-- Setup completed!

