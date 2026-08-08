"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ANON, fetchMe, type Me } from "@/lib/auth";

type AuthState = { me: Me; loading: boolean; refresh: () => Promise<void> };

const AuthContext = createContext<AuthState>({
  me: ANON,
  loading: true,
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ me: Me; loading: boolean }>({
    me: ANON,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    fetchMe().then((me) => {
      if (!cancelled) setState({ me, loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-read /api/me on demand. The account page needs it: closing an account
  // changes what every other surface should show, and a full reload to see it
  // would read as the page having failed.
  const refresh = useCallback(async () => {
    setState({ me: await fetchMe(), loading: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
