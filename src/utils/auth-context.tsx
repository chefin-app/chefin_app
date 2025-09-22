import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Alert, Linking } from 'react-native';
import { Session, User, AuthError } from '@supabase/supabase-js';
import { supabase } from '@/src/utils/supabaseClient';

interface AuthContextType {
  user: any | null;
  session: any | null;
  loading: boolean;
  initializing: boolean;

  // Email/Password Auth
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<{ error: string | null }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;

  // OAuth Auth
  signInWithFacebook: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;

  // Phone Auth
  signInWithPhone: (phone: string) => Promise<{ error: string | null }>;
  verifyOTP: (phone: string, token: string) => Promise<{ error: string | null }>;

  // Profile
  updateProfile: (updates: any) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    // Get initial session and subscribe to auth state changes
    const getSessionAndSubscribe = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error('Error getting session:', error.message);
      }
      setSession(data.session ?? null);
      setUser(data.session?.user ?? null);
      setInitializing(false);

      const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
      });

      return () => {
        subscription.subscription.unsubscribe();
      };
    };

    const cleanupPromise = getSessionAndSubscribe();

    // cleanup on unmount
    return () => {
      cleanupPromise.then(cleanup => {
        if (cleanup) cleanup();
      });
    };
  }, []);

  // Email/Password Authentication
  const signUp = async (email: string, password: string) => {
    try {
      setLoading(true);
      const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/auth/sign-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { error: data.error ?? 'Failed to sign up' };
      }
      return { error: null };
    } catch (err: any) {
      return { error: err.message ?? 'An error occurred' };
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      setLoading(true);
      const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/auth/sign-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.toLowerCase().trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { error: data.error ?? 'Failed to sign in' };
      }
      setUser(data.user ?? null);
      setSession(data.session ?? null);
      return { error: null };
    } catch (err: any) {
      return { error: err.message ?? 'An error occurred' };
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signOut();
      if (error) {
        return { error: error.message };
      }
      try {
        const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/auth/sign-out`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) {
          const data = await res.json();
        }
      } catch {}
      return { error: null };
    } catch (err: any) {
      return { error: err.message ?? 'An error occurred' };
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (email: string) => {
    try {
      setLoading(true);
      const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.toLowerCase().trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { error: data.error ?? 'Failed to send reset email' };
      }
      return { error: null };
    } catch (err: any) {
      return { error: err.message ?? 'An error occurred' };
    } finally {
      setLoading(false);
    }
  };

  const updatePassword = async (newPassword: string) => {
    try {
      setLoading(true);
      const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/auth/update-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { error: data.error ?? 'Failed to update password' };
      }
      return { error: null };
    } catch (err: any) {
      return { error: err.message ?? 'An error occurred' };
    } finally {
      setLoading(false);
    }
  };

  // OAuth Authentication
  const signInWithFacebook = async () => {
    // TODO: Implement OAuth flow
    return;
  };

  const signInWithGoogle = async () => {
    // TODO: Implement OAuth flow
    return;
  };

  const signInWithApple = async () => {
    // TODO: Implement OAuth flow
    return;
  };

  // Phone Authentication
  const signInWithPhone = async (phone: string) => {
    try {
      setLoading(true);
      const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/auth/sign-in-phone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { error: data.error ?? 'Phone sign-in failed' };
      }
      return { error: null };
    } catch (err: any) {
      return { error: err.message ?? 'An error occurred' };
    } finally {
      setLoading(false);
    }
  };

  const verifyOTP = async (phone: string, token: string) => {
    try {
      setLoading(true);
      const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, token }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { error: data.error ?? 'OTP verification failed' };
      }
      setUser(data.user ?? null);
      setSession(data.session ?? null);
      return { error: null };
    } catch (err: any) {
      return { error: err.message ?? 'An error occurred' };
    } finally {
      setLoading(false);
    }
  };

  // Profile Management
  const updateProfile = async (updates: any) => {
    try {
      setLoading(true);
      const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/auth/update-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) {
        return { error: data.error ?? 'Failed to update profile' };
      }
      return { error: null };
    } catch (err: any) {
      return { error: err.message ?? 'An error occurred' };
    } finally {
      setLoading(false);
    }
  };

  const value: AuthContextType = {
    user,
    session,
    loading,
    initializing,

    // Email/Password
    signUp,
    signIn,
    signOut,
    resetPassword,
    updatePassword,

    // OAuth
    signInWithFacebook,
    signInWithGoogle,
    signInWithApple,

    // Phone
    signInWithPhone,
    verifyOTP,

    // Profile
    updateProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
