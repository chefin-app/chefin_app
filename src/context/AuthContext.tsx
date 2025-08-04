// src/context/AuthContext.tsx
import { createContext, useContext } from 'react';
import { Session } from '@supabase/supabase-js';

type AuthContextType = {
  session: Session | null;
  isLoading: boolean;
};

export const AuthContext = createContext<AuthContextType>({
  session: null,
  isLoading: true,
});

export const useAuth = () => useContext(AuthContext);
