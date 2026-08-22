import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../api/client";
import { extractErrorMessage } from "../api/errors";
import { AppLayout } from "../components/AppLayout";
import { StatusBadge } from "../components/StatusBadge";
import type { CustomerOut, InvoiceOut } from "../api/types";

export function InvoicesPage() {
  const navigate = useNavigate();
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
          <h1>Invoices</h1>
          <button onClick={() => navigate("/invoices/new")}>New Invoice</button>
        </div>

        {loading && <p>Loading...</p>}
        {error && <p className="form-error">{error}</p>}

        {!loading && !error && (
          <table className="invoices-table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Total</th>
                <th>Due date</th>
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
                  <td>{invoice.number}</td>
                  <td>{customerName(invoice.customer_id)}</td>
                  <td>
                    <StatusBadge status={invoice.status} />
                  </td>
                  <td>{invoice.total}</td>
                  <td>{invoice.due_date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppLayout>
  );
}
