// Keep a single client instance so authentication state and environment
// resolution cannot diverge between legacy and current imports.
export { supabase } from '@/src/utils/supabaseClient';
