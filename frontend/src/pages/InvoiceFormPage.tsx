import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiClient } from "../api/client";
import { extractErrorMessage } from "../api/errors";
import { formatRate } from "../api/gst";
import { AppLayout } from "../components/AppLayout";
import { StateSelect } from "../components/StateSelect";
import type {
  CompanyOut,
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
  hsnCode: string;
  taxPercent: string; // "" => use the invoice's default rate
}

let keyCounter = 0;
function newKey(): string {
  keyCounter += 1;
  return `item-${keyCounter}`;
}

function emptyLineItem(): LineItemFormState {
  return {
    key: newKey(),
    productId: "",
    description: "",
    unitPrice: "",
    quantity: "1",
    hsnCode: "",
    taxPercent: "",
  };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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
  const [company, setCompany] = useState<CompanyOut | null>(null);

  const [customerId, setCustomerId] = useState("");
  const [issueDate, setIssueDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState(plusDaysIso(30));
  const [taxPercent, setTaxPercent] = useState("0");
  const [placeOfSupply, setPlaceOfSupply] = useState("");
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
      apiClient.get<CompanyOut>("/company"),
    ]).then(([customersRes, productsRes, companyRes]) => {
      setCustomers(customersRes.data);
      setProducts(productsRes.data);
      setCompany(companyRes.data);
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
        setPlaceOfSupply(data.place_of_supply ?? "");
        setNotes(data.notes ?? "");
        setItems(
          data.items.map((item) => ({
            key: newKey(),
            productId: item.product_id ?? "",
            description: item.description,
            unitPrice: item.unit_price,
            quantity: String(item.quantity),
            hsnCode: item.hsn_code ?? "",
            taxPercent: item.tax_percent === null ? "" : formatRate(item.tax_percent),
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
      updateItem(key, { productId: "", description: "", unitPrice: "", hsnCode: "", taxPercent: "" });
      return;
    }
    const product = products.find((p) => p.id === productId);
    updateItem(key, {
      productId,
      description: product?.name ?? "",
      unitPrice: product?.unit_price ?? "",
      hsnCode: product?.hsn_code ?? "",
      taxPercent: product?.gst_rate ? formatRate(product.gst_rate) : "",
    });
  }

  // Place of supply follows the customer's state (as the backend defaults it)
  // until the user picks another.
  function handleCustomerChange(nextCustomerId: string) {
    setCustomerId(nextCustomerId);
    const customer = customers.find((c) => c.id === nextCustomerId);
    setPlaceOfSupply(customer?.state_code ?? company?.state_code ?? "");
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

  // A preview of apply_tax in backend/app/services/invoice_tax.py; the saved
  // invoice always carries the server's figures.
  const registered = Boolean(company?.gstin);
  const interstate = registered && placeOfSupply !== "" && placeOfSupply !== company?.state_code;
  const tax = useMemo(() => {
    let cgst = 0;
    let igst = 0;
    let plain = 0;
    items.forEach((item, index) => {
      const productRate = products.find((p) => p.id === item.productId)?.gst_rate;
      const rate = Number(item.taxPercent !== "" ? item.taxPercent : (productRate ?? taxPercent)) || 0;
      const taxable = round2(lineTotals[index]);
      if (!registered) plain += round2((taxable * rate) / 100);
      else if (interstate) igst += round2((taxable * rate) / 100);
      else cgst += round2((taxable * rate) / 200);
    });
    return { cgst, igst, total: registered ? (interstate ? igst : cgst * 2) : plain };
  }, [items, products, lineTotals, taxPercent, registered, interstate]);
  const total = subtotal + tax.total;
  const taxLabel = registered ? "GST" : "Tax";

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
        hsn_code: item.hsnCode.trim() || null,
        tax_percent: item.taxPercent === "" ? null : item.taxPercent,
      }));

      if (isEdit && id) {
        const body: UpdateInvoice = {
          customer_id: customerId,
          issue_date: issueDate,
          due_date: dueDate,
          tax_percent: taxPercent,
          place_of_supply: placeOfSupply || null,
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
          place_of_supply: placeOfSupply || null,
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
              <select value={customerId} onChange={(e) => handleCustomerChange(e.target.value)} required>
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
              Place of supply
              <StateSelect value={placeOfSupply} onChange={setPlaceOfSupply} />
              {registered && placeOfSupply !== "" && (
                <span className="field-hint">
                  {interstate
                    ? "Outside your state, so IGST applies."
                    : "Within your state, so GST splits into CGST + SGST."}
                </span>
              )}
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
            <label>
              Default {taxLabel} %
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={taxPercent}
                onChange={(e) => setTaxPercent(e.target.value)}
              />
              <span className="field-hint">Used for any line that has no rate of its own.</span>
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
                <th>HSN/SAC</th>
                <th>Unit price</th>
                <th>Qty</th>
                <th>{taxLabel} %</th>
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
                      className="input-narrow mono"
                      inputMode="numeric"
                      pattern="[0-9]{4,8}"
                      title="4 to 8 digits"
                      value={item.hsnCode}
                      onChange={(e) => updateItem(item.key, { hsnCode: e.target.value })}
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
                  <td>
                    <input
                      className="input-narrow"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={item.taxPercent}
                      placeholder={formatRate(taxPercent)}
                      onChange={(e) => updateItem(item.key, { taxPercent: e.target.value })}
                    />
                  </td>
                  <td>{lineTotals[index].toFixed(2)}</td>
                  <td>
                    <button type="button" className="btn-sm btn-ghost" onClick={() => removeItem(item.key)}>
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
            <dt>{registered ? "Taxable value" : "Subtotal"}</dt>
            <dd>{subtotal.toFixed(2)}</dd>
            {!registered ? (
              <>
                <dt>Tax</dt>
                <dd>{tax.total.toFixed(2)}</dd>
              </>
            ) : interstate ? (
              <>
                <dt>IGST</dt>
                <dd>{tax.igst.toFixed(2)}</dd>
              </>
            ) : (
              <>
                <dt>CGST</dt>
                <dd>{tax.cgst.toFixed(2)}</dd>
                <dt>SGST</dt>
                <dd>{tax.cgst.toFixed(2)}</dd>
              </>
            )}
            <dt className="grand-total">Total</dt>
            <dd className="grand-total">{total.toFixed(2)}</dd>
          </dl>

          {error && <p className="form-error">{error}</p>}

          <div className="invoice-detail-actions">
            <button type="submit" className="btn-primary" disabled={submitting}>
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
