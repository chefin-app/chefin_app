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
          'Allow Chefin to use your location while the app is open to recommend nearby home restaurants.',
      },
    ],
  ],
  extra: {
    ...(config.extra ?? {}),
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  },
});
