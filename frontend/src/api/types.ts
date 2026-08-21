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

// Mirrors backend/app/schemas/customer.py exactly.

export interface CreateCustomer {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}

export interface UpdateCustomer {
  name?: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  is_active?: boolean;
}

export interface CustomerOut {
  id: string;
  company_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  is_active: boolean;
  created_at: string;
}

// Mirrors backend/app/schemas/product.py exactly.
// unit_price is a Decimal, which FastAPI/Pydantic serializes as a string.

export interface CreateProduct {
  sku: string;
  name: string;
  description?: string | null;
  unit_price: string;
  stock_quantity?: number;
  reorder_level?: number;
}

export interface UpdateProduct {
  sku?: string;
  name?: string;
  description?: string | null;
  unit_price?: string;
  stock_quantity?: number;
  reorder_level?: number;
  is_active?: boolean;
}

export interface ProductOut {
  id: string;
  company_id: string;
  sku: string;
  name: string;
  description: string | null;
  unit_price: string;
  stock_quantity: number;
  reorder_level: number;
  is_active: boolean;
  created_at: string;
}
