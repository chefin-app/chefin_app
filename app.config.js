export default ({ config }) => ({
  ...config,
  name: 'chefin_app',
  slug: 'chefin_app',
  scheme: 'chefin',
  plugins: [
    ...(config.plugins ?? []),
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Allow Chefin to recommend nearby home restaurants and pinpoint your delivery address for the cook and Lalamove rider.',
      },
    ],
  ],
  extra: {
    ...(config.extra ?? {}),
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  },
});
