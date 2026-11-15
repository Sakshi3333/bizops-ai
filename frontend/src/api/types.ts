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

// Mirrors backend/app/schemas/company.py exactly.

export interface UpdateCompany {
  email?: string;
  address?: string | null;
  gstin?: string | null;
  state_code?: string | null;
}

export interface CompanyOut {
  id: string;
  name: string;
  email: string;
  currency: string;
  address: string | null;
  gstin: string | null;
  state_code: string | null;
}

// Mirrors backend/app/schemas/customer.py exactly.
// state_code is a GST state code (see api/gst.ts).

export interface CreateCustomer {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  gstin?: string | null;
  state_code?: string | null;
}

export interface UpdateCustomer {
  name?: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  gstin?: string | null;
  state_code?: string | null;
  is_active?: boolean;
}

export interface CustomerOut {
  id: string;
  company_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  gstin: string | null;
  state_code: string | null;
  is_active: boolean;
  created_at: string;
}

// Mirrors backend/app/schemas/product.py exactly.
// unit_price and gst_rate are Decimals, which FastAPI/Pydantic serializes as strings.

export interface CreateProduct {
  sku: string;
  name: string;
  description?: string | null;
  unit_price: string;
  hsn_code?: string | null;
  gst_rate?: string | null;
  stock_quantity?: number;
  reorder_level?: number;
}

export interface UpdateProduct {
  sku?: string;
  name?: string;
  description?: string | null;
  unit_price?: string;
  hsn_code?: string | null;
  gst_rate?: string | null;
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
  hsn_code: string | null;
  gst_rate: string | null;
  stock_quantity: number;
  reorder_level: number;
  is_active: boolean;
  created_at: string;
}

// Mirrors backend/app/schemas/invoice.py exactly.
// Decimal fields (unit_price, line_total, subtotal, tax_percent, tax_amount,
// cgst/sgst/igst_amount, total) are serialized as strings.
// An item's tax_percent of null means "use the invoice's tax_percent".

export type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "CANCELLED";

export interface InvoiceItemInput {
  product_id?: string | null;
  description?: string | null;
  quantity: number;
  unit_price?: string | null;
  hsn_code?: string | null;
  tax_percent?: string | null;
}

export interface CreateInvoice {
  customer_id: string;
  issue_date: string;
  due_date: string;
  tax_percent?: string;
  place_of_supply?: string | null;
  notes?: string | null;
  items: InvoiceItemInput[];
}

export interface UpdateInvoice {
  customer_id?: string;
  issue_date?: string;
  due_date?: string;
  tax_percent?: string;
  place_of_supply?: string | null;
  notes?: string | null;
  items?: InvoiceItemInput[];
}

export interface ChangeInvoiceStatus {
  status: InvoiceStatus;
}

export interface InvoiceItemOut {
  id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: string;
  line_total: string;
  hsn_code: string | null;
  tax_percent: string | null;
  tax_amount: string;
}

export interface InvoiceOut {
  id: string;
  company_id: string;
  customer_id: string;
  number: string;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string;
  paid_at: string | null;
  subtotal: string;
  tax_percent: string;
  tax_amount: string;
  place_of_supply: string | null;
  cgst_amount: string;
  sgst_amount: string;
  igst_amount: string;
  total: string;
  notes: string | null;
  created_at: string;
  items: InvoiceItemOut[];
}

export const INVOICE_VALID_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT: ["SENT", "CANCELLED"],
  SENT: ["PAID", "CANCELLED"],
  PAID: [],
  CANCELLED: [],
};

// Mirrors backend/app/schemas/dashboard.py exactly.
// Decimal fields are serialized as strings.

export interface MonthlyRevenue {
  month: string; // "YYYY-MM"
  paid_amount: string;
  invoiced_amount: string;
}

export interface StatusCount {
  status: InvoiceStatus;
  count: number;
}

export interface TopCustomer {
  customer_id: string;
  name: string;
  total_billed: string;
}

export interface LowStockProduct {
  product_id: string;
  sku: string;
  name: string;
  stock_quantity: number;
  reorder_level: number;
}

export interface DashboardSummary {
  revenue_this_month: string;
  revenue_last_month: string;
  outstanding_total: string;
  overdue_total: string;
  monthly_trend: MonthlyRevenue[];
  status_counts: StatusCount[];
  top_customers: TopCustomer[];
  low_stock_products: LowStockProduct[];
}

// Mirrors backend/app/schemas/assistant.py exactly.

export interface AskRequest {
  question: string;
}

export interface ToolCallSummary {
  tool: string;
  summary: string;
}

export interface AskResponse {
  answer: string;
  tools_used: ToolCallSummary[];
}
