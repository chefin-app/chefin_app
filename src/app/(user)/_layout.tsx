// import { Tabs, useRouter } from 'expo-router';
// import { useEffect, useState, useCallback } from 'react';
// import { Ionicons } from '@expo/vector-icons';
// import { Session } from '@supabase/supabase-js';
// import { supabase } from '../../utils/supabase';

// const TAB_CONFIG = {
//   activeTintColor: '#4CAF50',
//   inactiveTintColor: '#999',
//   backgroundColor: '#fff',
//   borderColor: '#E0E0E0',
//   height: 84,
//   fontSize: 12,
// };

// export default function TabLayout() {
//   const [session, setSession] = useState<Session | null>(null);
//   const [loading, setLoading] = useState(true);
//   const router = useRouter();

//   const handleLoginPress = useCallback(() => {
//     console.log('Login tab pressed - navigating to auth');
//     router.push('/(auth)/login');
//   }, [router]);

//   useEffect(() => {
//     let isMounted = true;

//     const initializeAuth = async () => {
//       try {
//         const {
//           data: { session: initialSession },
//         } = await supabase.auth.getSession();

//         if (isMounted) {
//           setSession(initialSession);
//           setLoading(false);

//           console.log('Tab Layout - Session loaded:', {
//             isLoggedIn: !!initialSession?.user,
//             userId: initialSession?.user?.id || 'none',
//           });
//         }
//       } catch (error) {
//         console.error('Session error:', error);
//         if (isMounted) {
//           setSession(null);
//           setLoading(false);
//         }
//       }
//     };

//     initializeAuth();

//     const {
//       data: { subscription },
//     } = supabase.auth.onAuthStateChange((_event, newSession) => {
//       if (isMounted) {
//         setSession(newSession);
//       }
//     });

//     return () => {
//       isMounted = false;
//       subscription.unsubscribe();
//     };
//   }, []);

//   if (loading) {
//     return null;
//   }

//   const isLoggedIn = !!session?.user;

//   return (
//     <Tabs
//       screenOptions={{
//         headerShown: false,
//         tabBarActiveTintColor: TAB_CONFIG.activeTintColor,
//         tabBarInactiveTintColor: TAB_CONFIG.inactiveTintColor,
//         tabBarStyle: {
//           backgroundColor: TAB_CONFIG.backgroundColor,
//           borderTopColor: TAB_CONFIG.borderColor,
//           borderTopWidth: 1,
//           paddingBottom: 8,
//           paddingTop: 8,
//           height: TAB_CONFIG.height,
//         },
//         tabBarLabelStyle: {
//           fontSize: TAB_CONFIG.fontSize,
//           fontWeight: '500',
//           marginTop: 4,
//         },
//       }}
//     >
//       <Tabs.Screen
//         name="explore"
//         options={{
//           title: 'Explore',
//           tabBarIcon: ({ color, size }) => (
//             <Ionicons name="compass-outline" size={size} color={color} />
//           ),
//         }}
//       />

//       <Tabs.Screen
//         name="search"
//         options={{
//           title: 'Search',
//           tabBarIcon: ({ color, size }) => (
//             <Ionicons name="search-outline" size={size} color={color} />
//           ),
//         }}
//       />

//       <Tabs.Screen
//         name="account"
//         options={{
//           title: 'Account',
//           tabBarIcon: ({ color, size }) => (
//             <Ionicons name="person-outline" size={size} color={color} />
//           ),
//           href: isLoggedIn ? undefined : null,
//         }}
//       />

//       <Tabs.Screen
//         name="log"
//         options={{
//           title: 'Log In',
//           tabBarIcon: ({ color, size }) => (
//             <Ionicons name="log-in-outline" size={size} color={color} />
//           ),
//           href: !isLoggedIn ? undefined : null,
//         }}
//         listeners={{
//           tabPress: e => {
//             e.preventDefault();
//             handleLoginPress();
//           },
//         }}
//       />

//       <Tabs.Screen
//         name="index"
//         options={{
//           href: null,
//         }}
//       />
//     </Tabs>
//   );
// }

import { Tabs, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../utils/auth-context';

const TAB_CONFIG = {
  activeTintColor: '#4CAF50',
  inactiveTintColor: '#999',
  backgroundColor: '#fff',
  borderColor: '#E0E0E0',
  height: 84,
  fontSize: 12,
};

export default function TabLayout() {
  const { user, initializing } = useAuth();
  const router = useRouter();

  const handleLoginPress = useCallback(() => {
    console.log('Login tab pressed - navigating to auth');
    router.push('/(auth)/login');
  }, [router]);

  // Don't render tabs until auth state is determined
  if (initializing) {
    return null;
  }

  const isLoggedIn = !!user;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: TAB_CONFIG.activeTintColor,
        tabBarInactiveTintColor: TAB_CONFIG.inactiveTintColor,
        tabBarStyle: {
          backgroundColor: TAB_CONFIG.backgroundColor,
          borderTopColor: TAB_CONFIG.borderColor,
          borderTopWidth: 1,
          paddingBottom: 8,
          paddingTop: 8,
          height: TAB_CONFIG.height,
        },
        tabBarLabelStyle: {
          fontSize: TAB_CONFIG.fontSize,
          fontWeight: '500',
          marginTop: 4,
        },
      }}
    >
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="compass-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search-outline" size={size} color={color} />
          ),
        }}
      />

      {/* Account tab - only show if logged in */}
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
          href: isLoggedIn ? undefined : null, // Hide tab if not logged in
        }}
      />

      {/* Login tab - only show if not logged in */}
      <Tabs.Screen
        name="log"
        options={{
          title: 'Log In',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="log-in-outline" size={size} color={color} />
          ),
          href: !isLoggedIn ? undefined : null, // Hide tab if logged in
        }}
        listeners={{
          tabPress: e => {
            e.preventDefault();
            handleLoginPress();
          },
        }}
      />

      {/* Hidden route */}
      <Tabs.Screen
        name="index"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
