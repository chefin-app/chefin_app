import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kyylulozmjvnznbrsyfg.supabase.co';
const supabaseAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5eWx1bG96bWp2bnpuYnJzeWZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMyNDYxMjYsImV4cCI6MjA2ODgyMjEyNn0.-2Tj-LdsM7fOGukdGSokXZau0gp75h9GKk3agpCkNkk';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
