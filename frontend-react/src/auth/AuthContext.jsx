import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { loadSession, saveSession, setUnauthorizedHandler } from '../api/client.js';
import { Auth } from '../api/endpoints.js';
import { firebaseSignOut } from '../lib/firebase.js';

const AuthContext = createContext(null);
const ACTIVE_KEY = 'digivote.activeMembership';

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => loadSession());
  const [activeId, setActiveId] = useState(() => {
    try {
      return Number(localStorage.getItem(ACTIVE_KEY)) || null;
    } catch {
      return null;
    }
  });

  const logout = useCallback(() => {
    saveSession(null);
    setSession(null);
    firebaseSignOut();
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (loadSession()) logout();
    });
  }, [logout]);

  const startSession = useCallback((response) => {
    const s = { token: response.token, expiresAt: response.expiresAt, user: response.user };
    saveSession(s);
    setSession(s);
    return s;
  }, []);

  const refresh = useCallback(async () => {
    const user = await Auth.me();
    setSession((current) => {
      if (!current) return current;
      const next = { ...current, user };
      saveSession(next);
      return next;
    });
    return user;
  }, []);

  const memberships = session?.user?.memberships ?? [];
  const active = memberships.find((m) => m.membershipId === activeId) ?? memberships[0] ?? null;

  const selectMembership = useCallback((membershipId) => {
    setActiveId(membershipId);
    try {
      localStorage.setItem(ACTIVE_KEY, String(membershipId));
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      memberships,
      active,
      isAuthenticated: Boolean(session?.token),
      can: (permission) => Boolean(active?.permissions?.includes(permission)),
      startSession,
      refresh,
      logout,
      selectMembership,
    }),
    [session, memberships, active, startSession, refresh, logout, selectMembership],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
