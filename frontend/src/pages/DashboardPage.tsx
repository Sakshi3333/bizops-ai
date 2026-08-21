import { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { extractErrorMessage } from "../api/errors";
import type { UserOut } from "../api/types";

export function DashboardPage() {
  const { claims, logout } = useAuth();
  const [me, setMe] = useState<UserOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<UserOut>("/auth/me")
      .then(({ data }) => {
        if (!cancelled) setMe(data);
      })
      .catch((err) => {
        if (!cancelled) setError(extractErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="dashboard-page">
      <h1>Dashboard</h1>
      {loading && <p>Loading...</p>}
      {error && <p className="form-error">{error}</p>}
      {me && (
        <dl>
          <dt>Name</dt>
          <dd>{me.name}</dd>
          <dt>Email</dt>
          <dd>{me.email}</dd>
          {/* UserOut only carries company_id; the display name comes from
              the JWT's company_name claim set at login/register time. */}
          <dt>Company</dt>
          <dd>{claims?.company_name ?? me.company_id}</dd>
          <dt>Role</dt>
          <dd>{me.role}</dd>
        </dl>
      )}
      <button onClick={logout}>Log out</button>
    </main>
  );
}
