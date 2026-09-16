/* eslint-disable @typescript-eslint/no-require-imports */
process.env.EXPO_PUBLIC_SUPABASE_URL ??= 'https://example.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key';

jest.mock('expo-linking', () => ({
  createURL: path => `chefin://${String(path).replace(/^\/+/, '')}`,
  getInitialURL: jest.fn().mockResolvedValue(null),
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
