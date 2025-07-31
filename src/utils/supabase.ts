import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native'; // import to fix

const supabaseUrl = 'https://kyylulozmjvnznbrsyfg.supabase.co';
const supabaseAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5eWx1bG96bWp2bnpuYnJzeWZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMyNDYxMjYsImV4cCI6MjA2ODgyMjEyNn0.-2Tj-LdsM7fOGukdGSokXZau0gp75h9GKk3agpCkNkk';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    ...(Platform.OS !== "web" ? { storage: AsyncStorage } : {}), // fix: https://github.com/supabase/supabase-js/issues/870 other fixes: https://github.com/orgs/supabase/discussions/25909
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
