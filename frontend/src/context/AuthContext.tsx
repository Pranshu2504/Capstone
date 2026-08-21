import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import { api, setAuthTokenGetter } from '@/api/client';
import { supabase } from '@/lib/supabaseClient';

interface AuthContextType {
  session: Session | null;
  isLoaded: boolean;
  /** True once /api/auth/sync has created the local profile row for this session. */
  isSynced: boolean;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Creates the local profile row for a fresh session. Safe to call repeatedly. */
async function syncProfile(name: string) {
  await api.post('/api/auth/sync', { name });
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSynced, setIsSynced] = useState(false);
  const syncedForRef = useRef<string | null>(null);

  useEffect(() => {
    setAuthTokenGetter(() => session?.access_token ?? null);
  }, [session]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoaded(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // Every existing session (fresh sign-up, or a returning sign-in) needs a
  // local profile row before any /api/* call that requires one will work.
  // Keyed by user id so it only re-fires on an actual identity change.
  useEffect(() => {
    if (!session) {
      setIsSynced(false);
      return;
    }
    if (syncedForRef.current === session.user.id) {
      setIsSynced(true);
      return;
    }
    syncProfile(session.user.user_metadata?.name ?? session.user.email ?? 'ZORA member')
      .then(() => {
        syncedForRef.current = session.user.id;
        setIsSynced(true);
      })
      .catch((err) => {
        console.error('[auth] profile sync failed', err);
        setIsSynced(true); // Don't hard-block the app; screens fall back to mock data.
      });
  }, [session]);

  const signUp: AuthContextType['signUp'] = async (name, email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    if (error) throw error;

    // Signing up is meant to drop you straight into the app. A missing session
    // means the Supabase project still has "Confirm email" switched on, which
    // would otherwise look like a silent success that leaves you signed out.
    if (!data.session) {
      throw new Error(
        'Account created, but sign-in needs email confirmation to be turned off for this project.',
      );
    }
  };

  const signIn: AuthContextType['signIn'] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, isLoaded, isSynced, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
