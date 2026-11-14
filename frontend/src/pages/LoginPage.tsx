import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Briefcase, ShieldCheck, UserRound } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { extractErrorMessage } from "../api/errors";
import { AuthShell } from "../components/AuthShell";

// Accounts created by backend/app/seed.py, so visitors can try each role in one click.
const DEMO_PASSWORD = "demo1234";
const DEMO_ACCOUNTS = [
  {
    role: "Admin",
    email: "admin@demo.bizops",
    description: "Full access to the company workspace",
    icon: ShieldCheck,
  },
  {
    role: "Manager",
    email: "manager@demo.bizops",
    description: "Manages products, archives records, cancels invoices",
    icon: Briefcase,
  },
  {
    role: "Employee",
    email: "employee@demo.bizops",
    description: "Creates invoices and customers - no destructive actions",
    icon: UserRound,
  },
];

// The hosted API sleeps when idle, so the first request can take a while.
const SLOW_LOGIN_MS = 4000;

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!submitting) return;
    const timer = setTimeout(() => setSlow(true), SLOW_LOGIN_MS);
    return () => clearTimeout(timer);
  }, [submitting]);

  async function signIn(loginEmail: string, loginPassword: string) {
    setError(null);
    setSlow(false);
    setSubmitting(true);
    try {
      await login(loginEmail, loginPassword);
      navigate("/dashboard");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void signIn(email, password);
  }

  function handleDemo(demoEmail: string) {
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD);
    void signIn(demoEmail, DEMO_PASSWORD);
  }

  return (
    <AuthShell>
      <h1>Welcome back</h1>
      <p>Log in to your workspace, or explore the demo company below.</p>

      <form onSubmit={handleSubmit}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@company.com"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "Logging in..." : "Log in"}
        </button>
        {submitting && slow && (
          <p className="muted-text">
            Waking up the server - the free hosting tier sleeps when idle, so the first login can
            take up to a minute.
          </p>
        )}
      </form>

      <section className="demo-logins">
        <div className="demo-divider">Try the demo</div>
        <div className="demo-login-buttons">
          {DEMO_ACCOUNTS.map(({ role, email: demoEmail, description, icon: Icon }) => (
            <button
              key={demoEmail}
              type="button"
              disabled={submitting}
              onClick={() => handleDemo(demoEmail)}
            >
              <span className="demo-role-icon">
                <Icon size={17} />
              </span>
              <span className="demo-role-text">
                <strong>Continue as {role}</strong>
                <span>{description}</span>
              </span>
              <ArrowRight size={16} className="demo-role-arrow" />
            </button>
          ))}
        </div>
      </section>

      <p className="auth-switch">
        New here? <Link to="/register">Create a company</Link>
      </p>
    </AuthShell>
  );
}
