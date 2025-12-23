// supabase.js
// GitHub Pages–safe global Supabase client

(function () {
  // Supabase project credentials
  const SUPABASE_URL = "https://wlzjymtugtovmitkkjsw.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indsemp5bXR1Z3Rvdm1pdGtranN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyNjk4MzgsImV4cCI6MjA3ODg0NTgzOH0.vnHmV1GA--NXLLMWgetoS_AqZFYbHg2gWzMmQAncaME";

  // Expose for fallback/debug (index.html checks these)
  window.SUPABASE_URL = SUPABASE_URL;
  window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;

  // Supabase CDN guard
  if (!window.supabase || !window.supabase.createClient) {
    console.error("❌ Supabase CDN not loaded. Check supabase-js script tag.");
    return;
  }

  // Create and expose the client globally
  window.supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );

  console.log("✅ Supabase client initialized");
})();
