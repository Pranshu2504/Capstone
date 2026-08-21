import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from './env.js';

export const isAuthConfigured = Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);

/**
 * Service-role client — verifies user access tokens and manages auth users.
 * Never expose this key to the frontend; it bypasses row-level security.
 */
export const supabaseAdmin: SupabaseClient | null = isAuthConfigured
  ? createClient(env.supabaseUrl!, env.supabaseServiceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;
