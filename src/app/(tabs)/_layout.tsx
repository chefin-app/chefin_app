import { Tabs, useRouter } from 'expo-router';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../utils/supabase';
import { Session } from '@supabase/supabase-js';
import { Ionicons } from '@expo/vector-icons';

export default function TabLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Handle login tab press
  const handleLoginPress = useCallback(() => {
    console.log('Login tab pressed - navigating to auth');
    router.push('/(auth)/login');
  }, [router]);

  useEffect(() => {
    // Get initial session
    const getSession = async () => {
      try {
        const {
          data: { session: initialSession },
        } = await supabase.auth.getSession();
        setSession(initialSession);
        setLoading(false);

        console.log('Tab Layout - Session loaded:', {
          isLoggedIn: !!initialSession?.user,
          userId: initialSession?.user?.id || 'none',
        });
      } catch (error) {
        console.error('Session error:', error);
        setSession(null);
        setLoading(false);
      }
    };

    getSession();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      console.log('Tab Layout - Auth changed:', {
        isLoggedIn: !!newSession?.user,
        userId: newSession?.user?.id || 'none',
      });
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return null; // Show nothing while loading
  }

  const isLoggedIn = !!session?.user;
  console.log('Tab Layout - Rendering tabs, isLoggedIn:', isLoggedIn);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#4CAF50',
        tabBarInactiveTintColor: '#999',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: '#E0E0E0',
          borderTopWidth: 1,
          paddingBottom: 8,
          paddingTop: 8,
          height: 84,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
          marginTop: 4,
        },
      }}
    >
      {/* EXPLORE TAB - Always visible */}
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="compass-outline" size={size} color={color} />
          ),
        }}
      />

      {/* SEARCH TAB - Always visible */}
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search-outline" size={size} color={color} />
          ),
        }}
      />

      {/* ACCOUNT TAB - Only show when logged in */}
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
          // Hide this tab when not logged in
          href: isLoggedIn ? undefined : null,
        }}
      />

      {/* LOGIN TAB - Only show when not logged in */}
      <Tabs.Screen
        name="log"
        options={{
          title: 'Log In',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="log-in-outline" size={size} color={color} />
          ),
          // Hide this tab when logged in
          href: !isLoggedIn ? undefined : null,
        }}
        listeners={{
          tabPress: e => {
            e.preventDefault(); // Prevent default navigation
            handleLoginPress(); // Navigate to auth login
          },
        }}
      />

      {/* HIDDEN SCREENS */}
      <Tabs.Screen
        name="index"
        options={{
          href: null, // Always hidden
        }}
      />
    </Tabs>
  );
}
