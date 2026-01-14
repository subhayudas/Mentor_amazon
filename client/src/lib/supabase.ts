import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ijsinkuraeyaubpjqfap.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlqc2lua3VyYWV5YXVicGpxZmFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMTM2NDksImV4cCI6MjA4Mzg4OTY0OX0.2AuHsY6kJYK9SssG4oRf2CULWwFO_hgIIOMRlROxHi0';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});

