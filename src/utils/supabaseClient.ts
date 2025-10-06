import { createClient } from '@supabase/supabase-js';
// import Constants from 'expo-constants';

// const extra = Constants.expoConfig?.extra as {
//   supabaseUrl: string;
//   supabaseAnonKey: string;
// };

// if (!extra?.supabaseUrl || !extra?.supabaseAnonKey) {
//   throw new Error('Missing Supabase environment variables. Please check app.config.js / app.json');
// }

// export const supabase = createClient(extra.supabaseUrl, extra.supabaseAnonKey);
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
