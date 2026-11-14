import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { FileText, LayoutDashboard, LogOut, Package, Sparkles, Users } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { Brand } from "./AuthShell";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/invoices", label: "Invoices", icon: FileText },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/products", label: "Products", icon: Package },
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { claims, logout } = useAuth();
  const companyName = claims?.company_name ?? "Your company";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />

        <nav className="sidebar-nav" aria-label="Main">
          <div className="sidebar-section-label">Workspace</div>
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} title={label}>
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
          <NavLink to="/assistant" title="AI assistant">
            <Sparkles size={18} />
            <span>AI assistant</span>
            <em className="nav-badge">AI</em>
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <span className="avatar" aria-hidden="true">
            {initials(companyName)}
          </span>
          <div className="sidebar-user">
            <div className="sidebar-user-name">{companyName}</div>
            <div className="sidebar-user-role">{claims?.role.toLowerCase()}</div>
          </div>
          <button type="button" className="btn-ghost" onClick={logout} aria-label="Log out" title="Log out">
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <main className="app-main">{children}</main>
    </div>
  );
}
