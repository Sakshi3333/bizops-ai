import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiClient } from "../api/client";
import { extractErrorMessage } from "../api/errors";
import { AppLayout } from "../components/AppLayout";
import type {
  CreateInvoice,
  CustomerOut,
  InvoiceItemInput,
  InvoiceOut,
  ProductOut,
  UpdateInvoice,
} from "../api/types";

interface LineItemFormState {
  key: string;
  productId: string; // "" => custom line
  description: string;
  unitPrice: string;
  quantity: string;
}

let keyCounter = 0;
function newKey(): string {
  keyCounter += 1;
  return `item-${keyCounter}`;
}

function emptyLineItem(): LineItemFormState {
  return { key: newKey(), productId: "", description: "", unitPrice: "", quantity: "1" };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function plusDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function InvoiceFormPage() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [customers, setCustomers] = useState<CustomerOut[]>([]);
  const [products, setProducts] = useState<ProductOut[]>([]);

  const [customerId, setCustomerId] = useState("");
  const [issueDate, setIssueDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState(plusDaysIso(30));
  const [taxPercent, setTaxPercent] = useState("0");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItemFormState[]>([emptyLineItem()]);

  const [loading, setLoading] = useState(isEdit);
  const [notEditable, setNotEditable] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiClient.get<CustomerOut[]>("/customers"),
      apiClient.get<ProductOut[]>("/products"),
    ]).then(([customersRes, productsRes]) => {
      setCustomers(customersRes.data);
      setProducts(productsRes.data);
    });
  }, []);

  useEffect(() => {
    if (!id) return;
    apiClient
      .get<InvoiceOut>(`/invoices/${id}`)
      .then(({ data }) => {
        if (data.status !== "DRAFT") {
          setNotEditable(true);
          return;
        }
        setCustomerId(data.customer_id);
        setIssueDate(data.issue_date);
        setDueDate(data.due_date);
        setTaxPercent(data.tax_percent);
        setNotes(data.notes ?? "");
        setItems(
          data.items.map((item) => ({
            key: newKey(),
            productId: item.product_id ?? "",
            description: item.description,
            unitPrice: item.unit_price,
            quantity: String(item.quantity),
          })),
        );
      })
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [id]);

  function updateItem(key: string, patch: Partial<LineItemFormState>) {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function handleProductChange(key: string, productId: string) {
    if (productId === "") {
      updateItem(key, { productId: "", description: "", unitPrice: "" });
      return;
    }
    const product = products.find((p) => p.id === productId);
    updateItem(key, {
      productId,
      description: product?.name ?? "",
      unitPrice: product?.unit_price ?? "",
    });
  }

  function addItem() {
    setItems((current) => [...current, emptyLineItem()]);
  }

  function removeItem(key: string) {
    setItems((current) => (current.length > 1 ? current.filter((item) => item.key !== key) : current));
  }

  const lineTotals = useMemo(
    () =>
      items.map((item) => (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0)),
    [items],
  );
  const subtotal = useMemo(() => lineTotals.reduce((sum, v) => sum + v, 0), [lineTotals]);
  const taxAmount = useMemo(() => subtotal * ((Number(taxPercent) || 0) / 100), [subtotal, taxPercent]);
  const total = subtotal + taxAmount;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const itemsPayload: InvoiceItemInput[] = items.map((item) => ({
        product_id: item.productId || null,
        description: item.productId ? null : item.description,
        quantity: Number(item.quantity) || 1,
        unit_price: item.productId ? null : item.unitPrice,
      }));

      if (isEdit && id) {
        const body: UpdateInvoice = {
          customer_id: customerId,
          issue_date: issueDate,
          due_date: dueDate,
          tax_percent: taxPercent,
          notes: notes || null,
          items: itemsPayload,
        };
        await apiClient.patch(`/invoices/${id}`, body);
        navigate(`/invoices/${id}`);
      } else {
        const body: CreateInvoice = {
          customer_id: customerId,
          issue_date: issueDate,
          due_date: dueDate,
          tax_percent: taxPercent,
          notes: notes || null,
          items: itemsPayload,
        };
        const { data } = await apiClient.post<InvoiceOut>("/invoices", body);
        navigate(`/invoices/${data.id}`);
      }
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="invoice-form-page">
          <p>Loading...</p>
        </div>
      </AppLayout>
    );
  }

  if (notEditable) {
    return (
      <AppLayout>
        <div className="invoice-form-page">
          <h1>Cannot edit</h1>
          <p className="form-error">
            This invoice is no longer a draft and cannot be edited.{" "}
            <Link to={`/invoices/${id}`}>View it instead</Link>.
          </p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="invoice-form-page">
        <h1>{isEdit ? "Edit invoice" : "New invoice"}</h1>
        <form onSubmit={handleSubmit}>
          <div className="invoice-form-fields">
            <label>
              Customer
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
                <option value="" disabled>
                  Select a customer
                </option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tax %
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={taxPercent}
                onChange={(e) => setTaxPercent(e.target.value)}
              />
            </label>
            <label>
              Issue date
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                required
              />
            </label>
            <label>
              Due date
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
            </label>
          </div>

          <label>
            Notes
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </label>

          <table className="invoice-items-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Description</th>
                <th>Unit price</th>
                <th>Qty</th>
                <th>Line total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.key}>
                  <td>
                    <select
                      value={item.productId}
                      onChange={(e) => handleProductChange(item.key, e.target.value)}
                    >
                      <option value="">Custom item</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku} - {p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      value={item.description}
                      disabled={Boolean(item.productId)}
                      onChange={(e) => updateItem(item.key, { description: e.target.value })}
                      required
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.unitPrice}
                      disabled={Boolean(item.productId)}
                      onChange={(e) => updateItem(item.key, { unitPrice: e.target.value })}
                      required
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updateItem(item.key, { quantity: e.target.value })}
                      required
                    />
                  </td>
                  <td>{lineTotals[index].toFixed(2)}</td>
                  <td>
                    <button type="button" onClick={() => removeItem(item.key)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" onClick={addItem}>
            Add line item
          </button>

          <dl className="invoice-totals">
            <dt>Subtotal</dt>
            <dd>{subtotal.toFixed(2)}</dd>
            <dt>Tax</dt>
            <dd>{taxAmount.toFixed(2)}</dd>
            <dt className="grand-total">Total</dt>
            <dd className="grand-total">{total.toFixed(2)}</dd>
          </dl>

          {error && <p className="form-error">{error}</p>}

          <div className="invoice-detail-actions">
            <button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : isEdit ? "Save changes" : "Create draft"}
            </button>
            <button type="button" onClick={() => navigate(-1)}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
