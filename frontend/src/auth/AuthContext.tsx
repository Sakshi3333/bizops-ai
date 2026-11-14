import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiClient, setUnauthorizedHandler, TOKEN_STORAGE_KEY } from "../api/client";
import { decodeToken, isTokenExpired, type AccessTokenClaims } from "./jwt";
import type { LoginRequest, RegisterCompanyRequest, TokenResponse } from "../api/types";

export interface RegisterCompanyInput {
  companyName: string;
  companyEmail: string;
  currency?: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
}

// Mirrors MANAGER_ROLES in backend/app/core/deps.py.
const MANAGER_ROLES = ["SUPERADMIN", "ADMIN", "MANAGER"];

interface AuthContextValue {
  token: string | null;
  claims: AccessTokenClaims | null;
  isAuthenticated: boolean;
  /** Can manage products and perform destructive actions (delete, cancel). */
  isManager: boolean;
  login: (email: string, password: string) => Promise<void>;
  registerCompany: (input: RegisterCompanyInput) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// NOTE: persisting the JWT in localStorage is a deliberate simplification
// for this early build, not a final security choice — it's readable by any
// script running on the page, so it's vulnerable to XSS token theft. A
// production version should move to a backend-issued httpOnly cookie.
function readStoredToken(): string | null {
  const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (!stored) return null;

  const claims = decodeToken(stored);
  if (!claims || isTokenExpired(claims)) {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    return null;
  }
  return stored;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => readStoredToken());
  const [claims, setClaims] = useState<AccessTokenClaims | null>(() =>
    token ? decodeToken(token) : null,
  );

  const applyToken = useCallback((accessToken: string) => {
    localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
    setToken(accessToken);
    setClaims(decodeToken(accessToken));
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setClaims(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  const login = useCallback(
    async (email: string, password: string) => {
      const body: LoginRequest = { email, password };
      const { data } = await apiClient.post<TokenResponse>("/auth/login", body);
      applyToken(data.access_token);
    },
    [applyToken],
  );

  const registerCompany = useCallback(
    async (input: RegisterCompanyInput) => {
      const body: RegisterCompanyRequest = {
        company_name: input.companyName,
        company_email: input.companyEmail,
        currency: input.currency,
        admin_name: input.adminName,
        admin_email: input.adminEmail,
        admin_password: input.adminPassword,
      };
      const { data } = await apiClient.post<TokenResponse>("/auth/register-company", body);
      applyToken(data.access_token);
    },
    [applyToken],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      claims,
      isAuthenticated: token !== null,
      isManager: claims !== null && MANAGER_ROLES.includes(claims.role),
      login,
      registerCompany,
      logout,
    }),
    [token, claims, login, registerCompany, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
