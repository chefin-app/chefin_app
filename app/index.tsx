import { Redirect } from 'expo-router';

export default function Index() {
  //console.log("Supabase URL:", process.env.EXPO_PUBLIC_SUPABASE_URL)
  //console.log("Supabase Key:", process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.slice(0, 6) + "...")

  return <Redirect href="/(user)/(tabs)/home" />;
}
