import { supabase } from './supabase.js';

export async function logEvent(event, data = {}) {
  const { error } = await supabase
    .from('logs')
    .insert([{ 
      event,
      data,
      created_at: new Date().toISOString()
    }]);

  if (error) {
    console.error('Supabase log error:', error);
  }
}
