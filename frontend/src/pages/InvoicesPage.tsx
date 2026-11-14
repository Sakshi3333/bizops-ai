import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { apiClient } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { extractErrorMessage } from "../api/errors";
import { AppLayout } from "../components/AppLayout";
import { StatusBadge } from "../components/StatusBadge";
import type { CustomerOut, InvoiceOut } from "../api/types";

export function InvoicesPage() {
  const navigate = useNavigate();
  const { claims } = useAuth();
  const [invoices, setInvoices] = useState<InvoiceOut[]>([]);
  const [customers, setCustomers] = useState<CustomerOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiClient.get<InvoiceOut[]>("/invoices"),
      apiClient.get<CustomerOut[]>("/customers"),
    ])
      .then(([invoicesRes, customersRes]) => {
        setInvoices(invoicesRes.data);
        setCustomers(customersRes.data);
      })
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  const customerName = (customerId: string) =>
    customers.find((c) => c.id === customerId)?.name ?? customerId;

  return (
    <AppLayout>
      <div className="invoices-page">
        <div className="invoices-header">
          <div>
            <h1>Invoices</h1>
            <p className="page-subtitle">
              {loading ? "Loading..." : `${invoices.length} invoices - click one to view, send or mark paid.`}
            </p>
          </div>
          <button className="btn-primary" onClick={() => navigate("/invoices/new")}>
            <Plus size={16} />
            New invoice
          </button>
        </div>

        {loading && (
          <div className="loading">
            <span className="spinner" />
            Loading...
          </div>
        )}
        {error && <p className="form-error">{error}</p>}

        {!loading && !error && (
          <table className="invoices-table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Due date</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={5}>No invoices yet.</td>
                </tr>
              )}
              {invoices.map((invoice) => (
                <tr key={invoice.id} onClick={() => navigate(`/invoices/${invoice.id}`)}>
                  <td className="cell-strong mono">{invoice.number}</td>
                  <td>{customerName(invoice.customer_id)}</td>
                  <td>
                    <StatusBadge status={invoice.status} />
                  </td>
                  <td className="cell-muted">{invoice.due_date}</td>
                  <td className="num cell-strong">
                    {claims?.currency} {Number(invoice.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppLayout>
  );
}
