/** True when the mobile app should use local sample data instead of Supabase and the API. */
export const isMockMode = process.env.EXPO_PUBLIC_USE_MOCKS === 'true';
