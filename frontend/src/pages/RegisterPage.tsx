import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { extractErrorMessage } from "../api/errors";

export function RegisterPage() {
  const { registerCompany } = useAuth();
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState("");
  // RegisterCompanyRequest.company_email is required by the backend (no
  // default), so this field has to exist even though it's a step beyond
  // the bare minimum "company name / admin name / admin email / password".
  const [companyEmail, setCompanyEmail] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await registerCompany({ companyName, companyEmail, adminName, adminEmail, adminPassword });
      navigate("/dashboard");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <h1>Register your company</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Company name
          <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
        </label>
        <label>
          Company email
          <input
            type="email"
            value={companyEmail}
            onChange={(e) => setCompanyEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Your name
          <input value={adminName} onChange={(e) => setAdminName(e.target.value)} required />
        </label>
        <label>
          Your email
          <input
            type="email"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Creating..." : "Create company"}
        </button>
      </form>
      <p>
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </main>
  );
}
