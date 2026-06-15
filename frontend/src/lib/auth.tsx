import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "@tanstack/react-router";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api";
const AUTH_STORAGE_KEY = "codearena_auth";

export type AuthUser = {
  id: string;
  username: string;
  email: string;
  role: "user" | "admin";
};

type AuthState = {
  accessToken: string;
  user: AuthUser;
};

type AuthContextValue = {
  accessToken: string | null;
  user: AuthUser | null;
  isLoading: boolean;
  login: (credentials: { email: string; password: string }) => Promise<void>;
  register: (details: { username: string; email: string; password: string; country: string }) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function authRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = typeof data.message === "string" ? data.message : "Authentication request failed";
    throw new Error(message);
  }

  return data as T;
}

function decodeJwtPayload(token: string): Partial<AuthUser> | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    return JSON.parse(json) as Partial<AuthUser>;
  } catch {
    return null;
  }
}

function readStoredAuth(): AuthState | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthState) : null;
  } catch {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

function writeStoredAuth(state: AuthState | null) {
  if (typeof window === "undefined") return;

  if (!state) {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const authActionId = useRef(0);

  const setAuthState = useCallback((state: AuthState | null) => {
    setAuth(state);
    writeStoredAuth(state);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const bootstrapActionId = authActionId.current;

    async function bootstrap() {
      const stored = readStoredAuth();
      if (stored && !cancelled && authActionId.current === bootstrapActionId) {
        setAuth(stored);
      }

      try {
        const data = await authRequest<{ accessToken: string }>("/auth/refresh-token");
        const payload = decodeJwtPayload(data.accessToken);

        if (!payload?.id || !payload.email || !payload.username || !payload.role) {
          throw new Error("Invalid refresh response");
        }

        if (!cancelled && authActionId.current === bootstrapActionId) {
          setAuthState({
            accessToken: data.accessToken,
            user: {
              id: payload.id,
              email: payload.email,
              username: payload.username,
              role: payload.role,
            },
          });
        }
      } catch {
        if (!cancelled && authActionId.current === bootstrapActionId) {
          setAuthState(null);
        }
      } finally {
        if (!cancelled && authActionId.current === bootstrapActionId) {
          setIsLoading(false);
        }
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [setAuthState]);

  const login = useCallback(async (credentials: { email: string; password: string }) => {
    const data = await authRequest<AuthState>("/auth/login", credentials);
    authActionId.current += 1;
    setAuthState({ accessToken: data.accessToken, user: data.user });
    setIsLoading(false);
  }, [setAuthState]);

  const register = useCallback(async (details: { username: string; email: string; password: string; country: string }) => {
    const data = await authRequest<AuthState>("/auth/register", details);
    authActionId.current += 1;
    setAuthState({ accessToken: data.accessToken, user: data.user });
    setIsLoading(false);
  }, [setAuthState]);

  const logout = useCallback(async () => {
    try {
      await authRequest<{ message: string }>("/auth/logout");
    } finally {
      authActionId.current += 1;
      setAuthState(null);
      setIsLoading(false);
    }
  }, [setAuthState]);

  const value = useMemo<AuthContextValue>(() => ({
    accessToken: auth?.accessToken ?? null,
    user: auth?.user ?? null,
    isLoading,
    login,
    register,
    logout,
  }), [auth, isLoading, login, logout, register]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

export function useRequireAuth() {
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!auth.isLoading && !auth.user) {
      navigate({ to: "/login", replace: true });
    }
  }, [auth.isLoading, auth.user, navigate]);

  return auth;
}
