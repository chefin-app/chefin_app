import React, { createContext, useContext, useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
import { supabase } from '@/src/utils/supabaseClient';
import type { Session, User } from '@supabase/supabase-js';

// Where Supabase sends the user after they click the confirmation link.
// expo-linking resolves this to the app's deep link for the current runtime:
//   - dev build / production → chefinapp://callback
//   - Expo Go                → exp://<LAN-IP>:<port>/--/callback
// The matching value(s) must be listed in Supabase → Auth → URL Configuration.
const emailRedirectTo = Linking.createURL('/callback');

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  initializing: boolean;
  /**
   * Whether the signed-in user has finished the name + phone onboarding step.
   * `null` while unknown (no session, or the status hasn't loaded yet).
   */
  onboardingCompleted: boolean | null;
  /** Re-read onboarding status from the DB (call after completing onboarding). */
  refreshOnboardingStatus: () => Promise<void>;
  signUp: (
    email: string,
    password: string
  ) => Promise<{ error: string | null; userExists?: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<{ error: string | null }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
  signInWithFacebook: () => Promise<any>;
  signInWithGoogle: () => Promise<any>;
  signInWithApple: () => Promise<any>;
  signInWithPhone: (phone: string) => Promise<{ error: string }>;
  verifyOTP: () => Promise<{ error: string }>;
  updateProfile: () => Promise<{ error: string }>;
}

interface AuthProviderProps {
  children: React.ReactNode;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);

  // Read the onboarding flag for a given user. Missing profile row or missing
  // column → treat as not-yet-onboarded so we route them through it.
  const loadOnboardingStatus = async (userId: string | undefined) => {
    if (!userId) {
      setOnboardingCompleted(null);
      return;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      console.warn('Could not load onboarding status', error.message);
      setOnboardingCompleted(null);
      return;
    }
    setOnboardingCompleted(data?.onboarding_completed ?? false);
  };

  const refreshOnboardingStatus = async () => {
    await loadOnboardingStatus(user?.id);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      loadOnboardingStatus(session?.user?.id);
      setInitializing(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('Auth state changed:', _event);
      setSession(session);
      setUser(session?.user ?? null);
      loadOnboardingStatus(session?.user?.id);
      setInitializing(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.signUp({
        email: email.toLowerCase().trim(),
        password,
        options: { emailRedirectTo },
      });
      if (error) {
        // Supabase returns an explicit error for this when email confirmation
        // is off. When it's on, it returns 200 with no error instead (see below).
        const userExists = /already registered|already exists|already in use/i.test(error.message);
        return { error: error.message, userExists };
      }
      // When "Confirm email" is enabled, Supabase deliberately does NOT error
      // for an already-registered email (to avoid leaking which emails have
      // accounts) — it instead returns a user with an empty identities array
      // and no session. That's the only signal we get.
      const userExists = !!data.user && (data.user.identities?.length ?? 0) === 0;
      return { error: null, userExists };
    } catch (err: any) {
      return { error: err.message ?? 'An error occurred' };
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password,
      });
      if (error) return { error: error.message };
      setSession(data.session ?? null);
      setUser(data.session?.user ?? null);
      console.log('Signed in successfully');
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
      if (error) return { error: error.message };
      setUser(null);
      setSession(null);
      setOnboardingCompleted(null);
      console.log('👋 Signed out successfully');
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
      const { data, error } = await supabase.auth.resetPasswordForEmail(email.toLowerCase().trim());
      if (error) return { error: error.message };
      console.log('📧 Password reset email sent');
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
      const { data, error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) return { error: error.message };
      console.log('🔐 Password updated successfully');
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
    onboardingCompleted,
    refreshOnboardingStatus,
    signUp,
    signIn,
    signOut,
    resetPassword,
    updatePassword,
    signInWithFacebook: async () => Promise.resolve(),
    signInWithGoogle: async () => Promise.resolve(),
    signInWithApple: async () => Promise.resolve(),
    signInWithPhone: async (phone: string) => {
      const { error } = await supabase.auth.signInWithOtp({
        phone,
        options: { shouldCreateUser: true },
      });
      return { error: error?.message ?? '' };
    },
    verifyOTP: async () => Promise.resolve({ error: 'Not implemented' }),
    updateProfile: async () => Promise.resolve({ error: 'Not implemented' }),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
