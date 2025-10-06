export default {
  expo: {
    name: 'chefin_app',
    slug: 'chefin_app',
    scheme: 'chefin',
    extra: {
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    },
  },
};
