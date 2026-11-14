import { useEffect, useState, type ComponentType } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Clock, Plus, Wallet } from "lucide-react";
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
  icon: Icon,
  tone,
  delta,
  hint,
}: {
  label: string;
  value: string;
  icon: ComponentType<{ size?: number }>;
  tone: "accent" | "warn" | "bad";
  delta?: { text: string; good: boolean } | null;
  hint?: string;
}) {
  return (
    <div className="stat-tile">
      <div className="stat-tile-top">
        <span className="stat-tile-label">{label}</span>
        <span className={`stat-tile-icon tone-${tone}`}>
          <Icon size={18} />
        </span>
      </div>
      <div className="stat-tile-value">{value}</div>
      {delta && (
        <div className={`stat-tile-delta ${delta.good ? "delta-good" : "delta-bad"}`}>
          {delta.good ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
          {delta.text}
        </div>
      )}
      {!delta && hint && <div className="stat-tile-hint">{hint}</div>}
    </div>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function DashboardPage() {
  const { claims } = useAuth();
  const navigate = useNavigate();
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
        <div className="page-header">
          <div>
            <h1>{greeting()}</h1>
            <p className="page-subtitle">
              Here's how {claims?.company_name ?? "your business"} is doing this month.
            </p>
          </div>
          <div className="page-actions">
            <button type="button" className="btn-primary" onClick={() => navigate("/invoices/new")}>
              <Plus size={16} />
              New invoice
            </button>
          </div>
        </div>

        {loading && (
          <div className="loading">
            <span className="spinner" />
            Loading your numbers...
          </div>
        )}
        {error && <p className="form-error">{error}</p>}

        {summary && (
          <>
            <div className="stat-tiles">
              <StatTile
                label="Revenue this month"
                value={formatMoney(summary.revenue_this_month, claims?.currency)}
                icon={Wallet}
                tone="accent"
                delta={revenueDelta}
                hint="No paid invoices last month to compare"
              />
              <StatTile
                label="Outstanding"
                value={formatMoney(summary.outstanding_total, claims?.currency)}
                icon={Clock}
                tone="warn"
                hint="Sent invoices awaiting payment"
              />
              <StatTile
                label="Overdue"
                value={formatMoney(summary.overdue_total, claims?.currency)}
                icon={AlertTriangle}
                tone="bad"
                hint="Past their due date"
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
                      {summary.top_customers.map((c, i) => (
                        <tr key={c.customer_id}>
                          <td>
                            <span className="rank">{i + 1}</span>
                            {c.name}
                          </td>
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
                            <div className="cell-strong">{p.name}</div>
                            <div className="muted-text mono">{p.sku}</div>
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
