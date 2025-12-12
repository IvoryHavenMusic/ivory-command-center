<script type="module">
// supabase.js (ES module)
// 👉 Fill these with YOUR project values (Anon key only — never the service role)
const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_PUBLIC_ANON_KEY';

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // important for PKCE exchange on /auth/callback
  },
});
</script>
