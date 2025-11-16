// music-tracker.js
// Helper functions for talking to the `music_tracker` table in Supabase.

import { supabase } from './supabase.js';

/**
 * Create a new music tracker entry.
 *
 * `entry` should be an object whose keys match your `music_tracker` columns.
 * Example:
 * {
 *   song_title: 'Tropical High',
 *   label: 'Ivory Ocean',
 *   status: 'backlog',
 *   version: 'v6',
 *   demo_number: 'Demo 3',
 *   engine_version: 'v6',
 *   notes: 'Chosen for single, not scheduled yet'
 * }
 */
export async function createMusicEntry(entry) {
  const { data, error } = await supabase
    .from('music_tracker')
    .insert([entry])
    .select()
    .single();

  if (error) {
    console.error('createMusicEntry error:', error);
    throw error;
  }

  return data;
}

/**
 * Update an existing music tracker row by its `id`.
 *
 * `patch` is a partial object – only the fields you want to change.
 */
export async function updateMusicEntry(id, patch) {
  const { data, error } = await supabase
    .from('music_tracker')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('updateMusicEntry error:', error);
    throw error;
  }

  return data;
}

/**
 * Convenience helper: set status + optional note.
 * (Assumes your table has a `status` and `status_note` column.)
 */
export async function setStatus(id, status, statusNote = null) {
  const patch = { status };

  if (statusNote !== null) {
    patch.status_note = statusNote;
  }

  return updateMusicEntry(id, patch);
}

/**
 * Convenience helper: mark a track as "backlog".
 */
export async function markBacklog(id, note = null) {
  return setStatus(id, 'backlog', note);
}

/**
 * Convenience helper: mark a track as "scheduled" with a target date.
 * Assumes a `status` and `scheduled_release_date` column exist.
 */
export async function markScheduled(id, scheduledDate, note = null) {
  const patch = {
    status: 'scheduled',
    scheduled_release_date: scheduledDate
  };

  if (note !== null) {
    patch.status_note = note;
  }

  return updateMusicEntry(id, patch);
}

/**
 * Convenience helper: mark a track as "live" with a link.
 * Assumes `status`, `status_note`, and `live_link` columns exist.
 */
export async function markLive(id, liveLink, note = 'Released and live') {
  const patch = {
    status: 'live',
    status_note: note,
    live_link: liveLink
  };

  return updateMusicEntry(id, patch);
}

/**
 * Convenience helper: archive a track.
 * Assumes `status` and `archived_reason` columns exist.
 */
export async function archiveTrack(id, reason = 'Superseded by newer version') {
  const patch = {
    status: 'archived',
    archived_reason: reason
  };

  return updateMusicEntry(id, patch);
}

/**
 * List all tracks (optionally filtered by label or status).
 */
export async function listTracks({ label, status } = {}) {
  let query = supabase.from('music_tracker').select('*').order('created_at', {
    ascending: true
  });

  if (label) {
    query = query.eq('label', label);
  }

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    console.error('listTracks error:', error);
    throw error;
  }

  return data;
}
