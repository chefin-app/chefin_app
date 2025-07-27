import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="email-login" />
      <Stack.Screen name="phone-login" />
      {/* <Stack.Screen name="phone-signup" /> */}
      <Stack.Screen name="phone-verify" />
      <Stack.Screen name="setup-password" />
      <Stack.Screen name="callback" />
    </Stack>
  );
}
