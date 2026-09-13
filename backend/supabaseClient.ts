// backend/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';
import './env';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend/.env or .env');
}

export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
