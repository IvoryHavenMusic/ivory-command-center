import { supabase } from '../supabase.js';

/**
 * Log when a song/video is played.
 *
 * @param {Object} data
 * @param {string} data.platform - 'YouTube', 'Spotify', etc.
 * @param {string} data.artist - e.g. 'Ivory Haven'
 * @param {string} data.song - song title
 * @param {string} data.timestamp - ISO string from the client
 */
export async function logPlay(data) {
  const { platform, artist, song, timestamp } = data;

  const { error } = await supabase
    .from('plays')
    .insert({
      platform,
      artist,
      song,
      timestamp
    });

  if (error) {
    console.error('Supabase error:', error);
    throw new Error('Failed to log play');
  }
}
