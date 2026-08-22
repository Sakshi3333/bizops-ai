import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function AppLayout({ children }: { children: ReactNode }) {
  const { logout } = useAuth();

  return (
    <div className="app-layout">
      <nav className="app-nav">
        <NavLink to="/dashboard" className={({ isActive }) => (isActive ? "active" : undefined)}>
          Dashboard
        </NavLink>
        <NavLink to="/customers" className={({ isActive }) => (isActive ? "active" : undefined)}>
          Customers
        </NavLink>
        <NavLink to="/products" className={({ isActive }) => (isActive ? "active" : undefined)}>
          Products
        </NavLink>
        <NavLink to="/invoices" className={({ isActive }) => (isActive ? "active" : undefined)}>
          Invoices
        </NavLink>
        <button onClick={logout}>Log out</button>
      </nav>
      <main>{children}</main>
    </div>
  );
}
