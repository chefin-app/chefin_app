import 'react-native-url-polyfill/auto'; // import to fix
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native'; // import to fix
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}), // fix: https://github.com/supabase/supabase-js/issues/870 other fixes: https://github.com/orgs/supabase/discussions/25909
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
}); */
