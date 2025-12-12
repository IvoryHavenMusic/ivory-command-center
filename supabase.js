// supabase.js  (pure ES module)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://wlzjymtugtovmitkkjsw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indsemp5bXR1Z3Rvdm1pdGtranN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyNjk4MzgsImV4cCI6MjA3ODg0NTgzOH0.vnHmV1GA--NXLLMWgetoS_AqZFYbHg2gWzMmQAncaME'; // anon/public key only

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
