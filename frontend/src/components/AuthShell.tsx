import type { ReactNode } from "react";
import { Building2, FileText, Sparkles, TrendingUp } from "lucide-react";

const FEATURES = [
  {
    icon: Sparkles,
    title: "Ask your data in plain English",
    text: "An AI assistant that answers only from your company's real numbers.",
  },
  {
    icon: FileText,
    title: "Invoices that behave like records",
    text: "Draft, send, get paid, with stock that moves when invoices do.",
  },
  {
    icon: TrendingUp,
    title: "Revenue at a glance",
    text: "Collected, outstanding and overdue, plus trends and low-stock alerts.",
  },
  {
    icon: Building2,
    title: "Built for many companies",
    text: "Every workspace is fully isolated, with roles for each team member.",
  },
];

const STACK = ["React 19", "TypeScript", "FastAPI", "PostgreSQL", "Gemini"];

export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <Sparkles size={18} strokeWidth={2.2} />
      </span>
      <span className="brand-name">BizOps AI</span>
    </div>
  );
}

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-shell">
      <aside className="auth-hero">
        <Brand />
        <div>
          <h1>Run your business. Ask it anything.</h1>
          <p className="auth-hero-lead">
            Invoicing, inventory and analytics for small businesses, with an AI assistant that knows
            your numbers.
          </p>
          <ul className="auth-features">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title}>
                <span className="auth-feature-icon">
                  <Icon size={18} />
                </span>
                <div>
                  <strong>{title}</strong>
                  <span>{text}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="auth-stack">
          {STACK.map((tech) => (
            <span key={tech}>{tech}</span>
          ))}
        </div>
      </aside>
      <div className="auth-panel">
        <main className="auth-page">{children}</main>
      </div>
    </div>
  );
}
