export default ({ config }) => {
  // EXPO_PUBLIC_* is the preferred client naming convention. The fallback
  // keeps existing local .env files working without exposing server-only keys.
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseAnonKey =
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;

  return {
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
      supabaseUrl,
      supabaseAnonKey,
    },
  };
};
