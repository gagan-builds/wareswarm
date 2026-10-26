/**
 * Purpose: Client-side authentication hook and state manager for WareSwarm.
 * Role in the project: Manages user login state, token persistence in localStorage, and authentication actions across the Next.js app.
 * Key contents: useAuth hook, login, signup, demoLogin, logout, session restoration.
 * Talks to: frontend/lib/api.ts (calls /api/auth endpoints) and consumed by frontend/components/NavBar.tsx and page components.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { api, UserProfile } from './api';

/** LocalStorage key for persisting session bearer token. */
const TOKEN_KEY = 'wareswarm_auth_token';

/** LocalStorage key for persisting cached user profile data. */
const USER_KEY = 'wareswarm_auth_user';

/**
 * Custom React hook for managing authentication state and actions.
 * @returns {{
 *   user: UserProfile | null,
 *   token: string | null,
 *   loading: boolean,
 *   isAuthenticated: boolean,
 *   login: (username_or_email: string, password: string) => Promise<any>,
 *   signup: (data: any) => Promise<any>,
 *   demoLogin: () => Promise<any>,
 *   logout: () => void
 * }}
 */
export function useAuth() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize and restore saved session from browser localStorage on component mount
  useEffect(() => {
    try {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      const storedUser = localStorage.getItem(USER_KEY);
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      }
    } catch {
      // Ignore localStorage read errors in restricted browser environments
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Helper function to commit authentication credentials to state and localStorage.
   */
  const saveSession = (tok: string, usr: UserProfile) => {
    setToken(tok);
    setUser(usr);
    try {
      localStorage.setItem(TOKEN_KEY, tok);
      localStorage.setItem(USER_KEY, JSON.stringify(usr));
    } catch {
      // Ignore storage write quota exceptions
    }
  };

  /**
   * Clears active session credentials and removes items from localStorage.
   */
  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      // Ignore removal errors
    }
  }, []);

  /**
   * Authenticates user with username or email and password.
   * Calls POST /api/auth/signin and updates local session state.
   */
  const login = async (username_or_email: string, password: string) => {
    const res = await api.signIn({ username_or_email, password });
    if (res.token && res.user) {
      saveSession(res.token, res.user);
    }
    return res;
  };

  /**
   * Registers a new account, auto-logging the user in upon success.
   * Calls POST /api/auth/signup and saves session tokens.
   */
  const signup = async (data: {
    username: string;
    email: string;
    password: string;
    full_name?: string;
    role?: string;
  }) => {
    const res = await api.signUp(data);
    if (res.token && res.user) {
      saveSession(res.token, res.user);
    }
    return res;
  };

  /**
   * Generates or logs into an instant demo guest account for immediate sandbox testing.
   * Calls POST /api/auth/demo without requiring registration.
   */
  const demoLogin = async () => {
    const res = await api.demoLogin();
    if (res.token && res.user) {
      saveSession(res.token, res.user);
    }
    return res;
  };

  return {
    user,
    token,
    loading,
    isAuthenticated: !!user,
    login,
    signup,
    demoLogin,
    logout,
  };
}
