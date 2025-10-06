import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/src/utils/supabaseClient';
import type { Session, User } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  initializing: boolean;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<{ error: string | null }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
  signInWithFacebook: () => Promise<any>;
  signInWithGoogle: () => Promise<any>;
  signInWithApple: () => Promise<any>;
  signInWithPhone: () => Promise<{ error: string }>;
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

  useEffect(() => {
    console.log('🔄 Initializing Supabase Auth...');

    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('📦 Initial session:', session);
      setSession(session);
      setUser(session?.user ?? null);
      setInitializing(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('⚡ Auth state changed:', _event, session);
      setSession(session);
      setUser(session?.user ?? null);
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
      });
      if (error) return { error: error.message };
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
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password,
      });
      if (error) return { error: error.message };
      setSession(data.session ?? null);
      setUser(data.session?.user ?? null);
      console.log('✅ Signed in successfully:', data.session);
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
    signUp,
    signIn,
    signOut,
    resetPassword,
    updatePassword,
    signInWithFacebook: async () => Promise.resolve(),
    signInWithGoogle: async () => Promise.resolve(),
    signInWithApple: async () => Promise.resolve(),
    signInWithPhone: async () => Promise.resolve({ error: 'Not implemented' }),
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
