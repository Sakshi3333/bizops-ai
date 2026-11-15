import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, Pencil } from "lucide-react";
import { apiClient } from "../api/client";
import { extractErrorMessage } from "../api/errors";
import { formatRate, stateName } from "../api/gst";
import { AppLayout } from "../components/AppLayout";
import { useAuth } from "../auth/AuthContext";
import { StatusBadge } from "../components/StatusBadge";
import { INVOICE_VALID_TRANSITIONS } from "../api/types";
import type { ChangeInvoiceStatus, CustomerOut, InvoiceOut, InvoiceStatus } from "../api/types";

// Label for the button that moves an invoice INTO this status. DRAFT is
// never a valid transition target (see INVOICE_VALID_TRANSITIONS), so
// that entry is unreachable - kept only so this is a total Record.
const STATUS_ACTION_LABEL: Record<InvoiceStatus, string> = {
  DRAFT: "",
  SENT: "Issue invoice",
  PAID: "Mark as paid",
  CANCELLED: "Cancel invoice",
};

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isManager } = useAuth();
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

  // A plain <a href> can't send the bearer token, so fetch the PDF as a blob
  // through the authenticated client and hand it to the browser to save.
  async function handleDownloadPdf() {
    if (!invoice) return;
    setActionError(null);
    try {
      const { data } = await apiClient.get<Blob>(`/invoices/${invoice.id}/pdf`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${invoice.number}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setActionError(extractErrorMessage(err));
    }
  }

  // Invoices from a company without a GSTIN (and any issued before GST support)
  // carry no split, just one tax amount.
  const hasGstSplit =
    invoice !== null && (Number(invoice.igst_amount) > 0 || Number(invoice.cgst_amount) > 0);
  const taxLabel = hasGstSplit ? "GST" : "Tax";

  return (
    <AppLayout>
      <div className="invoice-detail-page">
        <Link to="/invoices" className="back-link">
          <ArrowLeft size={15} />
          All invoices
        </Link>

        {loading && (
          <div className="loading">
            <span className="spinner" />
            Loading invoice...
          </div>
        )}
        {error && <p className="form-error">{error}</p>}

        {invoice && (
          <>
            <div className="invoice-detail-header">
              <h1>{invoice.number}</h1>
              <StatusBadge status={invoice.status} />
            </div>

            <dl className="invoice-meta">
              <div>
                <dt>Customer</dt>
                <dd>{customer?.name ?? invoice.customer_id}</dd>
              </div>
              {customer?.gstin && (
                <div>
                  <dt>Customer GSTIN</dt>
                  <dd className="mono">{customer.gstin}</dd>
                </div>
              )}
              {invoice.place_of_supply && (
                <div>
                  <dt>Place of supply</dt>
                  <dd>{stateName(invoice.place_of_supply)}</dd>
                </div>
              )}
              <div>
                <dt>Issue date</dt>
                <dd>{invoice.issue_date}</dd>
              </div>
              <div>
                <dt>Due date</dt>
                <dd>{invoice.due_date}</dd>
              </div>
              {invoice.paid_at && (
                <div>
                  <dt>Paid on</dt>
                  <dd>{invoice.paid_at.slice(0, 10)}</dd>
                </div>
              )}
              {invoice.notes && (
                <div>
                  <dt>Notes</dt>
                  <dd>{invoice.notes}</dd>
                </div>
              )}
            </dl>

            <table className="invoice-items-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>HSN/SAC</th>
                  <th className="num">Unit price</th>
                  <th className="num">Qty</th>
                  <th className="num">Taxable value</th>
                  <th className="num">{taxLabel} %</th>
                  <th className="num">{taxLabel}</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.description}</td>
                    <td className="mono cell-muted">{item.hsn_code ?? "—"}</td>
                    <td className="num">{item.unit_price}</td>
                    <td className="num">{item.quantity}</td>
                    <td className="num cell-strong">{item.line_total}</td>
                    <td className="num">{formatRate(item.tax_percent ?? invoice.tax_percent)}%</td>
                    <td className="num">{item.tax_amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <dl className="invoice-totals">
              <dt>{hasGstSplit ? "Taxable value" : "Subtotal"}</dt>
              <dd>{invoice.subtotal}</dd>
              {Number(invoice.igst_amount) > 0 ? (
                <>
                  <dt>IGST</dt>
                  <dd>{invoice.igst_amount}</dd>
                </>
              ) : Number(invoice.cgst_amount) > 0 ? (
                <>
                  <dt>CGST</dt>
                  <dd>{invoice.cgst_amount}</dd>
                  <dt>SGST</dt>
                  <dd>{invoice.sgst_amount}</dd>
                </>
              ) : (
                <>
                  <dt>Tax</dt>
                  <dd>{invoice.tax_amount}</dd>
                </>
              )}
              <dt className="grand-total">Total</dt>
              <dd className="grand-total">{invoice.total}</dd>
            </dl>

            {actionError && <p className="form-error">{actionError}</p>}

            <div className="invoice-detail-actions">
              {invoice.status === "DRAFT" && (
                <button onClick={() => navigate(`/invoices/${invoice.id}/edit`)}>
                  <Pencil size={15} />
                  Edit
                </button>
              )}
              {INVOICE_VALID_TRANSITIONS[invoice.status]
                .filter((nextStatus) => isManager || nextStatus !== "CANCELLED")
                .map((nextStatus) => (
                <button
                  key={nextStatus}
                  className={nextStatus === "CANCELLED" ? "btn-danger" : "btn-primary"}
                  disabled={actionPending}
                  onClick={() => handleStatusChange(nextStatus)}
                >
                  {STATUS_ACTION_LABEL[nextStatus]}
                </button>
              ))}
              <button onClick={handleDownloadPdf}>
                <Download size={15} />
                Download PDF
              </button>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
