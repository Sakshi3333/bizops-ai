import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiClient } from "../api/client";
import { extractErrorMessage } from "../api/errors";
import { AppLayout } from "../components/AppLayout";
import { StatusBadge } from "../components/StatusBadge";
import { INVOICE_VALID_TRANSITIONS } from "../api/types";
import type { ChangeInvoiceStatus, CustomerOut, InvoiceOut, InvoiceStatus } from "../api/types";

// Label for the button that moves an invoice INTO this status. DRAFT is
// never a valid transition target (see INVOICE_VALID_TRANSITIONS), so
// that entry is unreachable - kept only so this is a total Record.
const STATUS_ACTION_LABEL: Record<InvoiceStatus, string> = {
  DRAFT: "",
  SENT: "Issue",
  PAID: "Mark Paid",
  CANCELLED: "Cancel",
};

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<InvoiceOut | null>(null);
  const [customer, setCustomer] = useState<CustomerOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    apiClient
      .get<InvoiceOut>(`/invoices/${id}`)
      .then(({ data }) => {
        setInvoice(data);
        return apiClient.get<CustomerOut>(`/customers/${data.customer_id}`);
      })
      .then(({ data }) => setCustomer(data))
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleStatusChange(status: InvoiceStatus) {
    if (!id) return;
    setActionPending(true);
    setActionError(null);
    try {
      const body: ChangeInvoiceStatus = { status };
      await apiClient.post(`/invoices/${id}/status`, body);
      load();
    } catch (err) {
      setActionError(extractErrorMessage(err));
    } finally {
      setActionPending(false);
    }
  }

  return (
    <AppLayout>
      <div className="invoice-detail-page">
        {loading && <p>Loading...</p>}
        {error && <p className="form-error">{error}</p>}

        {invoice && (
          <>
            <div className="invoice-detail-header">
              <h1>{invoice.number}</h1>
              <StatusBadge status={invoice.status} />
            </div>

            <dl>
              <dt>Customer</dt>
              <dd>{customer?.name ?? invoice.customer_id}</dd>
              <dt>Issue date</dt>
              <dd>{invoice.issue_date}</dd>
              <dt>Due date</dt>
              <dd>{invoice.due_date}</dd>
              {invoice.paid_at && (
                <>
                  <dt>Paid at</dt>
                  <dd>{invoice.paid_at}</dd>
                </>
              )}
              {invoice.notes && (
                <>
                  <dt>Notes</dt>
                  <dd>{invoice.notes}</dd>
                </>
              )}
            </dl>

            <table className="invoice-items-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Unit price</th>
                  <th>Qty</th>
                  <th>Line total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.description}</td>
                    <td>{item.unit_price}</td>
                    <td>{item.quantity}</td>
                    <td>{item.line_total}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <dl className="invoice-totals">
              <dt>Subtotal</dt>
              <dd>{invoice.subtotal}</dd>
              <dt>Tax ({invoice.tax_percent}%)</dt>
              <dd>{invoice.tax_amount}</dd>
              <dt className="grand-total">Total</dt>
              <dd className="grand-total">{invoice.total}</dd>
            </dl>

            {actionError && <p className="form-error">{actionError}</p>}

            <div className="invoice-detail-actions">
              {invoice.status === "DRAFT" && (
                <button onClick={() => navigate(`/invoices/${invoice.id}/edit`)}>Edit</button>
              )}
              {INVOICE_VALID_TRANSITIONS[invoice.status].map((nextStatus) => (
                <button
                  key={nextStatus}
                  disabled={actionPending}
                  onClick={() => handleStatusChange(nextStatus)}
                >
                  {STATUS_ACTION_LABEL[nextStatus]}
                </button>
              ))}
              <Link to="/invoices">Back to invoices</Link>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
