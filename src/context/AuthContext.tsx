import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import apiClient, { hydrateAuthMemory, setAuthPersistHandler } from '../api/apiClient';
import { API_ENDPOINTS } from '../api/apiConfig';
import { mergeAuthUserFromApi, unwrapData } from '../utils/apiHelpers';
import { persistTokens, readStoredSession, writeStoredUser } from '../services/authentication/session';

type AuthValue = {
  ready: boolean;
  user: any;
  setUser: (user: any) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<any>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUserState] = useState<any>(null);

  const setUser = useCallback(async (next: any) => {
    setUserState(next);
    await writeStoredUser(next);
  }, []);

  const signOut = useCallback(async () => {
    apiClient.clearTokens();
    setUserState(null);
    await writeStoredUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const response = await apiClient.get(API_ENDPOINTS.AUTH.ME);
    const apiRaw = unwrapData(response) || response?.data || response;
    const fresh = mergeAuthUserFromApi(user, apiRaw);
    if (fresh) await setUser(fresh);
    return fresh;
  }, [setUser, user]);

  useEffect(() => {
    setAuthPersistHandler(persistTokens);
    apiClient.setSessionExpiredHandler(() => {
      setUserState(null);
      writeStoredUser(null).catch(() => {});
    });

    let active = true;
    (async () => {
      let stored = { authToken: null as string | null, refreshToken: null as string | null, userJson: null as string | null };
      try {
        stored = await readStoredSession();
        hydrateAuthMemory(stored);
        if (stored.userJson) {
          try {
            const cachedUser = JSON.parse(stored.userJson);
            if (active && cachedUser) {
              setUserState(cachedUser);
              setReady(true);
            }
          } catch {
            /* ignore malformed cache */
          }
        }
        if (!stored.authToken) return;
        const response = await apiClient.get(API_ENDPOINTS.AUTH.ME);
        const apiRaw = unwrapData(response) || response?.data || response;
        let storedUser = null;
        try {
          storedUser = stored.userJson ? JSON.parse(stored.userJson) : null;
        } catch {
          storedUser = null;
        }
        const fresh = mergeAuthUserFromApi(storedUser, apiRaw);
        if (active && fresh) {
          setUserState(fresh);
          await writeStoredUser(fresh);
        }
      } catch (err: any) {
        if (err?.status === 401) {
          apiClient.clearTokens();
          if (active) setUserState(null);
          await writeStoredUser(null);
          return;
        }
        if (active && stored.userJson) {
          try {
            setUserState(JSON.parse(stored.userJson));
          } catch {
            setUserState(null);
          }
        }
      } finally {
        if (active) setReady(true);
      }
    })();

    return () => {
      active = false;
      apiClient.setSessionExpiredHandler(null);
    };
  }, []);

  const value = useMemo(
    () => ({ ready, user, setUser, signOut, refreshUser }),
    [ready, refreshUser, setUser, signOut, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
