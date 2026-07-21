"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { ANON, fetchMe, type Me } from "@/lib/auth";

type AuthState = { me: Me; loading: boolean };

const AuthContext = createContext<AuthState>({ me: ANON, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ me: ANON, loading: true });

  useEffect(() => {
    let cancelled = false;
    fetchMe().then((me) => {
      if (!cancelled) setState({ me, loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
