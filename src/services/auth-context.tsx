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
  accountStatus: 'active' | 'suspended' | 'deactivated' | null;
  suspensionReason: string | null;
  suspensionEndsAt: string | null;
  canMutate: boolean;
  /** Re-read onboarding status from the DB (call after completing onboarding). */
  refreshOnboardingStatus: () => Promise<void>;
  refreshAccountStatus: () => Promise<void>;
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
  const [accountStatus, setAccountStatus] = useState<AuthContextType['accountStatus']>(null);
  const [suspensionReason, setSuspensionReason] = useState<string | null>(null);
  const [suspensionEndsAt, setSuspensionEndsAt] = useState<string | null>(null);

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

  const loadAccountStatus = async (currentSession: Session | null) => {
    if (!currentSession?.access_token) {
      setAccountStatus(null);
      setSuspensionReason(null);
      setSuspensionEndsAt(null);
      return;
    }

    const applyAccountStatus = (account: {
      status: Exclude<AuthContextType['accountStatus'], null>;
      suspensionReason?: string | null;
      suspensionEndsAt?: string | null;
    }) => {
      const suspensionExpired =
        account.status === 'suspended' &&
        Boolean(account.suspensionEndsAt) &&
        new Date(account.suspensionEndsAt!).getTime() <= Date.now();
      setAccountStatus(suspensionExpired ? 'active' : account.status);
      setSuspensionReason(suspensionExpired ? null : (account.suspensionReason ?? null));
      setSuspensionEndsAt(suspensionExpired ? null : (account.suspensionEndsAt ?? null));
    };

    let apiError: unknown = null;
    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/account/status`, {
        headers: { Authorization: `Bearer ${currentSession.access_token}` },
      });
      const payload = (await response.json().catch(() => ({}))) as {
        account?: {
          status?: AuthContextType['accountStatus'];
          suspensionReason?: string | null;
          suspensionEndsAt?: string | null;
        };
        error?: string;
      };
      const status = payload.account?.status;
      if (!response.ok || !status) {
        throw new Error(payload.error ?? `Account status request failed (${response.status}).`);
      }
      applyAccountStatus({ ...payload.account, status });
      return;
    } catch (error) {
      apiError = error;
    }

    // Status is stored on the user's own profile, which is already readable
    // under the profile RLS policy. This fallback keeps the app usable when a
    // newly deployed client briefly reaches an older or restarting API server.
    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('account_status, suspension_reason, suspension_ends_at')
      .eq('user_id', currentSession.user.id)
      .maybeSingle();
    if (!profileError && data?.account_status) {
      applyAccountStatus({
        status: data.account_status as Exclude<AuthContextType['accountStatus'], null>,
        suspensionReason: data.suspension_reason,
        suspensionEndsAt: data.suspension_ends_at,
      });
      return;
    }

    console.warn('Could not load account status', {
      apiError: apiError instanceof Error ? apiError.message : String(apiError),
      profileError: profileError?.message ?? 'Profile status was unavailable.',
    });
    if (profileError || !data) {
      setAccountStatus(null);
      setSuspensionReason(null);
      setSuspensionEndsAt(null);
    }
  };

  const refreshAccountStatus = async () => {
    await loadAccountStatus(session);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      loadOnboardingStatus(session?.user?.id);
      loadAccountStatus(session);
      setInitializing(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('Auth state changed:', _event);
      setSession(session);
      setUser(session?.user ?? null);
      loadOnboardingStatus(session?.user?.id);
      loadAccountStatus(session);
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
      setAccountStatus(null);
      setSuspensionReason(null);
      setSuspensionEndsAt(null);
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
    accountStatus,
    suspensionReason,
    suspensionEndsAt,
    canMutate: accountStatus === 'active',
    refreshOnboardingStatus,
    refreshAccountStatus,
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
