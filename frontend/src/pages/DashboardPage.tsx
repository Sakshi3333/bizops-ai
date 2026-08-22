import { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { extractErrorMessage } from "../api/errors";
import { AppLayout } from "../components/AppLayout";
import { RevenueBarChart } from "../components/RevenueBarChart";
import { StatusDonut } from "../components/StatusDonut";
import type { DashboardSummary } from "../api/types";

function formatMoney(value: string, currency?: string): string {
  const n = Number(value);
  const formatted = n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${currency} ${formatted}` : formatted;
}

function StatTile({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: { text: string; good: boolean } | null;
}) {
  return (
    <div className="stat-tile">
      <div className="stat-tile-label">{label}</div>
      <div className="stat-tile-value">{value}</div>
      {delta && (
        <div className={`stat-tile-delta ${delta.good ? "delta-good" : "delta-bad"}`}>{delta.text}</div>
      )}
    </div>
  );
}

export function DashboardPage() {
  const { claims } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<DashboardSummary>("/dashboard/summary")
      .then(({ data }) => {
        if (!cancelled) setSummary(data);
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

  let revenueDelta: { text: string; good: boolean } | null = null;
  if (summary) {
    const thisMonth = Number(summary.revenue_this_month);
    const lastMonth = Number(summary.revenue_last_month);
    if (lastMonth > 0) {
      const pct = ((thisMonth - lastMonth) / lastMonth) * 100;
      revenueDelta = {
        text: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% vs last month`,
        good: pct >= 0,
      };
    } else if (thisMonth > 0) {
      revenueDelta = { text: "vs $0 last month", good: true };
    }
  }

  return (
    <AppLayout>
      <div className="dashboard-page">
        <h1>Dashboard{claims?.company_name ? ` — ${claims.company_name}` : ""}</h1>

        {loading && <p>Loading...</p>}
        {error && <p className="form-error">{error}</p>}

        {summary && (
          <>
            <div className="stat-tiles">
              <StatTile
                label="Revenue this month"
                value={formatMoney(summary.revenue_this_month, claims?.currency)}
                delta={revenueDelta}
              />
              <StatTile
                label="Outstanding"
                value={formatMoney(summary.outstanding_total, claims?.currency)}
              />
              <StatTile
                label="Overdue"
                value={formatMoney(summary.overdue_total, claims?.currency)}
              />
            </div>

            <RevenueBarChart data={summary.monthly_trend} />

            <div className="dashboard-grid">
              <StatusDonut data={summary.status_counts} />

              <div className="dashboard-panel">
                <h3>Top customers</h3>
                {summary.top_customers.length === 0 ? (
                  <p className="muted-text">No billed invoices yet.</p>
                ) : (
                  <table className="dashboard-list-table">
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Total billed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.top_customers.map((c) => (
                        <tr key={c.customer_id}>
                          <td>{c.name}</td>
                          <td>{formatMoney(c.total_billed, claims?.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="dashboard-panel">
                <h3>Low stock</h3>
                {summary.low_stock_products.length === 0 ? (
                  <p className="muted-text">Nothing below its reorder level.</p>
                ) : (
                  <table className="dashboard-list-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Stock</th>
                        <th>Reorder level</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.low_stock_products.map((p) => (
                        <tr key={p.product_id}>
                          <td>
                            {p.sku} — {p.name}
                          </td>
                          <td className="low-stock-value">{p.stock_quantity}</td>
                          <td>{p.reorder_level}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
