import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { extractErrorMessage } from "../api/errors";

// Accounts created by backend/app/seed.py, so visitors can try each role in one click.
const DEMO_PASSWORD = "demo1234";
const DEMO_ACCOUNTS = [
  { role: "Admin", email: "admin@demo.bizops" },
  { role: "Manager", email: "manager@demo.bizops" },
  { role: "Employee", email: "employee@demo.bizops" },
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
    <main className="auth-page">
      <h1>Log in</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
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
        <button type="submit" disabled={submitting}>
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
        <h2>Try the demo</h2>
        <p className="muted-text">Sign in as a sample company's staff - each role sees different actions.</p>
        <div className="demo-login-buttons">
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.email}
              type="button"
              disabled={submitting}
              onClick={() => handleDemo(account.email)}
            >
              {account.role}
            </button>
          ))}
        </div>
      </section>

      <p>
        No account yet? <Link to="/register">Register a company</Link>
      </p>
    </main>
  );
}
