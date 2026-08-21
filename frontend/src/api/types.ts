// Mirrors backend/app/schemas/auth.py exactly.

export type UserRole = "SUPERADMIN" | "ADMIN" | "MANAGER" | "EMPLOYEE";

export interface RegisterCompanyRequest {
  company_name: string;
  company_email: string;
  currency?: string;
  admin_name: string;
  admin_email: string;
  admin_password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface UserOut {
  id: string;
  company_id: string;
  name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
}
