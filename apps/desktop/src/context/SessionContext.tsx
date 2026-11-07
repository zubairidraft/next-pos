import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, AppStatus, errorText, hasPerm, Permission, SessionInfo } from "../lib/api";

interface SessionCtx {
  loading: boolean;
  startupError: string | null;
  status: AppStatus | null;
  session: SessionInfo | null;
  refresh: () => Promise<void>;
  setSession: (s: SessionInfo | null) => void;
  logout: () => Promise<void>;
  can: (p: Permission) => boolean;
}

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [session, setSessionState] = useState<SessionInfo | null>(null);

  const refresh = useCallback(async () => {
    try {
      const info = await api.appStatus();
      if (!info.ok || !info.status) {
        setStartupError(info.error || "The shop database could not be opened.");
        setStatus(null);
        setSessionState(null);
      } else {
        setStartupError(null);
        setStatus(info.status);
        setSessionState(info.status.session);
      }
    } catch (e) {
      setStartupError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Lock the screen when the 12-hour session runs out.
  useEffect(() => {
    if (!session) return;
    const ms = new Date(session.expires_at).getTime() - Date.now();
    if (ms <= 0) {
      setSessionState(null);
      return;
    }
    const t = setTimeout(() => setSessionState(null), Math.min(ms, 2 ** 31 - 1));
    return () => clearTimeout(t);
  }, [session]);

  const setSession = (s: SessionInfo | null) => {
    setSessionState(s);
    refresh();
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      /* already logged out */
    }
    setSessionState(null);
    refresh();
  };

  return (
    <Ctx.Provider value={{ loading, startupError, status, session, refresh, setSession, logout, can: (p) => hasPerm(session, p) }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSession(): SessionCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSession must be used inside SessionProvider");
  return c;
}
