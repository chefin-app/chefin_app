import { DEMO_PROFILE_ID, DEMO_USER_ID, mockDb } from '@/src/mocks/fixtures';
import type { MockRow } from '@/src/mocks/db';

type AuthListener = (event: string, session: MockSession | null) => void;

type MockUser = {
  id: string;
  email: string;
  phone: string;
  identities: Array<{ id: string }>;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
  aud: string;
  created_at: string;
};

type MockSession = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: MockUser;
};

const listeners = new Set<AuthListener>();

const demoUser = (): MockUser => ({
  id: DEMO_USER_ID,
  email: 'aisha@chefin.app',
  phone: '+60123456789',
  identities: [{ id: 'mock-identity' }],
  app_metadata: {},
  user_metadata: { full_name: 'Aisha Rahman' },
  aud: 'authenticated',
  created_at: '2026-01-12T02:00:00.000Z',
});

let currentSession: MockSession | null = null;

const notify = (event: string) => {
  listeners.forEach(listener => listener(event, currentSession));
};

const signIn = (email?: string) => {
  currentSession = {
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    token_type: 'bearer',
    user: { ...demoUser(), email: email?.trim() || demoUser().email },
  };
  notify('SIGNED_IN');
  return { data: { session: currentSession, user: currentSession.user }, error: null };
};

export const createMockSupabase = () => ({
  auth: {
    getSession: async () => ({ data: { session: currentSession }, error: null }),
    getUser: async () => ({ data: { user: currentSession?.user ?? null }, error: null }),
    onAuthStateChange: (callback: AuthListener) => {
      listeners.add(callback);
      return {
        data: {
          subscription: {
            unsubscribe: () => listeners.delete(callback),
          },
        },
      };
    },
    signInWithPassword: async ({ email }: { email: string; password: string }) => signIn(email),
    signUp: async ({ email }: { email: string; password: string }) => signIn(email),
    signInWithOtp: async () => ({ data: {}, error: null }),
    signInWithOAuth: async () => signIn(),
    verifyOtp: async () => signIn(),
    signOut: async () => {
      currentSession = null;
      notify('SIGNED_OUT');
      return { error: null };
    },
    resetPasswordForEmail: async () => ({ data: {}, error: null }),
    updateUser: async (changes: MockRow) => {
      if (currentSession && typeof changes.email === 'string')
        currentSession.user.email = changes.email;
      return { data: { user: currentSession?.user ?? null }, error: null };
    },
    setSession: async () => signIn(),
  },
  from: (table: string) => mockDb.from(table),
  channel: () => {
    const channel = {
      on: () => channel,
      subscribe: () => channel,
    };
    return channel;
  },
  removeChannel: () => undefined,
  storage: {
    from: () => ({
      upload: async () => ({ data: { path: 'mock/photo.jpg' }, error: null }),
      remove: async () => ({ data: null, error: null }),
      getPublicUrl: () => ({
        data: {
          publicUrl:
            'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=800&q=80',
        },
      }),
      createSignedUrl: async () => ({
        data: {
          signedUrl:
            'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=800&q=80',
        },
        error: null,
      }),
    }),
  },
});

export const mockDemoProfileId = DEMO_PROFILE_ID;
